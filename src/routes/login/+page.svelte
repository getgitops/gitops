<script lang="ts">
  import { enhance } from '$app/forms';

  let error = '';
</script>

<svelte:head>
  <title>Login - Pulumi Open State</title>
</svelte:head>

<div class="max-w-md mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
  <h1 class="text-2xl font-bold mb-2">Sign in</h1>
  <p class="text-sm text-gray-500 mb-6">Use the default admin account to continue.</p>

  {#if error}
    <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <form
    method="POST"
    action="/api/auth/login"
    use:enhance={() => {
      return async ({ result }) => {
        if (result.type === 'success' || result.type === 'redirect') {
          window.location.href = '/projects';
        } else {
          error = 'Invalid credentials';
        }
      };
    }}
    class="space-y-4"
  >
    <div>
      <label class="block text-sm font-semibold text-gray-700 mb-1" for="username">Username</label>
      <input
        id="username"
        name="username"
        type="text"
        class="w-full rounded-lg border border-gray-300 px-4 py-2.5"
        value="admin"
      />
    </div>
    <div>
      <label class="block text-sm font-semibold text-gray-700 mb-1" for="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        class="w-full rounded-lg border border-gray-300 px-4 py-2.5"
        value="admin"
      />
    </div>
    <button type="submit" class="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white"
      >Sign in</button
    >
  </form>
</div>
