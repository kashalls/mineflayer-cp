export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ssr: false,
  devtools: { enabled: false },
  runtimeConfig: {
    // Each key is overridden by the matching NUXT_* environment variable.
    adminPassword: '',
    sessionSecret: '',
    internalToken: '',
    mcpToken: '',
    encryptionKey: '',
    dataDir: '.data',
    // {id} and {namespace} are substituted per account.
    botUrlTemplate: 'http://mfcp-bot-{id}.{namespace}.svc:8080',
    k8s: {
      enabled: true,
      namespace: 'default',
      botImage: '',
      botImagePullPolicy: 'IfNotPresent',
      botImagePullSecrets: '[]',
      botResources: '{}',
      ownerDeployment: '',
      secretName: '',
      panelUrl: ''
    }
  }
})
