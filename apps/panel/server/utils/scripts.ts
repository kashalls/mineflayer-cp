import { z } from 'zod'

export const ScriptInput = z.object({
  name: z.string().min(1).max(80),
  code: z.string().max(100_000),
  runOnSpawn: z.boolean().default(false),
  shared: z.boolean().default(false)
})
