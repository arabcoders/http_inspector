export type RequestSummary = {
    id: number
    method: string
    url: string
    headers: string
    clientIp: string
    remoteIp: string
    createdAt: string
    isBinary: boolean
    ContentType: string
    contentLength: number
}
