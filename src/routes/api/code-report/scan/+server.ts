import { json } from '@sveltejs/kit';
import { codeReportService, codeReportAnalysisService } from '../../../../modules/code-report';
import { apiKeysService } from '../../../../modules/auth';

type AnalyseResultBody = {
  service: string;
  project: string;
  analysisId?: string;
  gitInfo?: {
    repositoryUrl?: string;
    branch?: string;
    commit?: string;
    version?: string;
    author?: string;
  };
  status?: string;
  error?: string | null;
  result?: unknown;
  tool: string;
};

const STATUS_MAP: Record<string, 'start' | 'in_progress' | 'completed' | 'failed'> = {
  start: 'start',
  in_progress: 'in_progress',
  completed: 'completed',
  failed: 'failed',
};

function normalizeGitInfo(gitInfo: AnalyseResultBody['gitInfo']) {
  if (!gitInfo) return undefined;
  return {
    repositoryUrl: gitInfo.repositoryUrl || null,
    branch: gitInfo.branch ?? null,
    commit: gitInfo.commit ?? null,
    author: gitInfo.author ?? null,
    version: gitInfo.version ?? null,
  };
}


// single machine-to-machine endpoint for CI/CD tools: authenticates via a project-scoped
// server access key (Authorization: Bearer gvs_...), not a browser session
export async function POST({ request }) {

  // console.log('REQUEST BODY:', await request.clone().text()); // Log the request body for debugging
  // const authHeader = request.headers.get('authorization') || '';
  // const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  // if (!token) {
  //   return json({ error: 'Missing API key' }, { status: 401 });
  // }

  // const apiKey = await apiKeysService.resolveApiKey(token);
  // if (!apiKey || !apiKey.projectId) {
  //   return json({ error: 'Invalid or unscoped API key' }, { status: 401 });
  // }

  const body = (await request.json()) as AnalyseResultBody;

  const status =
    STATUS_MAP[
      String(body.status || '')
        .toLowerCase()
        .trim()
    ];
  if (!status) {
    return json(
      { error: "status must be 'in_progress', 'completed' or 'failed'" },
      { status: 400 },
    );
  }

  let message = '';
  let analysis;
  let tools = []
  if(['start', 'in_progress'].includes(status)) {
    //use service and project to find or create the service
    if (!body.service) {
      return json({ error: 'service is required' }, { status: 400 });
    }
    if (!body.project) {
      return json({ error: 'project is required' }, { status: 400 });
    }

    let serviceCodeReport = await codeReportService.getByProjectAndSlug(body.project, body.service).catch(async (err) => {
      console.log('err', err)
      return await codeReportService.createService({
        project: body.project,
        name: body.service,
      });
    });
    tools = serviceCodeReport?.tools || []
    console.log('✅ Service found or created:', serviceCodeReport);
    if(status === 'start') {
      message = 'Scan started';
    } else if(status === 'in_progress') {
      console.log('Starting analysis for service:', serviceCodeReport?.id, 'with tool:', body.tool);
      analysis = await codeReportAnalysisService.startAnalysis({
        serviceId: serviceCodeReport?.id || '',
        tool: body.tool,
        gitInfo: normalizeGitInfo(body.gitInfo),
      });
      console.log('ANALYSIS', analysis)
      message = `Scan in progress with tool ${body.tool}.`;
    }
  } else {
    // completed or failed
    // use analysisId to find
    if(!body.analysisId) {
      return json({ error: 'analysisId is required for failed status' }, { status: 400 });
    }
    if(status === 'failed') {
      await codeReportAnalysisService.failAnalysis(body.analysisId, {
        error: body.error || 'Unknown error',
        gitInfo: normalizeGitInfo(body.gitInfo),
      });
      message = 'Scan failed saved';
    } else if (status === 'completed') {
      await codeReportAnalysisService.completeAnalysis(body.analysisId, {
        result: body.result,
        summary: undefined,
      });
    }
  }

  console.log('[POST] /api/code-report/scan completed with status:', status);
  return json({
    success: true,
    message: message,
    analysis: {
      status,
      id: analysis?.id
    },
    tools,
  });
}
