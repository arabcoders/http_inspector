import { defineEventHandler } from 'h3'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async event => {
  try {
    event.node.res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return await readFile(join(process.cwd(), 'README.md'), 'utf-8')
  } catch (error) {
    console.error('Failed to read README.md:', error)
    throw createError({ statusCode: 500, message: 'Failed to load README', })
  }
})
