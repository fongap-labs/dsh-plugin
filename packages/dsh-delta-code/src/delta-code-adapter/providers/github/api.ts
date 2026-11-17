/** External GitHub HTTP and credential boundary. Repository rules belong to the feature. */
import { GitHubApiFailure, GitHubWriteUncertain } from '../../contracts/github.js'
import type { DeltaGitHubRequest, DeltaGitHubResponse, DeltaGitHubTransport } from '../../contracts/github.js'

const API = 'https://api.github.com'

export async function requestGitHubApi(input: DeltaGitHubRequest): Promise<DeltaGitHubResponse> {
  const { repository, account, tokenEnv, method, path, data, signal } = input
  const token = tokenEnv ? process.env[tokenEnv] : undefined
  if (!token?.trim()) throw new Error('GitHub credential unavailable for repository owner ' + account + ' (set env ' + tokenEnv + ')')
  const url = API + path
  if (!url.startsWith(API + '/') || !new URL(url).hostname.endsWith('github.com')) {
    throw new Error('invalid GitHub API URL')
  }
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token.trim(),
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dsh-delta-code',
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal,
      redirect: 'error',
    })
  } catch (error) {
    if (method !== 'GET') throw new GitHubWriteUncertain(method, repository)
    throw error
  }
  if (!response.ok) throw new GitHubApiFailure(response.status, repository, method)
  return { repository, account, data: response.status === 204 ? null : await response.json() }
}

/** Provider implementation supplied only by the composition root. */
export const githubTransport: DeltaGitHubTransport = { request: requestGitHubApi }
