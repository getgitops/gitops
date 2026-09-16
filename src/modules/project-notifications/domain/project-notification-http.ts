export const HTTP_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type HttpTemplateConfig = {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
};

export const DEFAULT_HTTP_TEMPLATE_CONFIG: HttpTemplateConfig = {
  url: 'https://cloud.getgitops.com/health',
  method: 'POST',
  headers: {},
};
