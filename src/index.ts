/**
 * Moltbook Integration Plugin for OpenClaw
 *
 * Provides actions for:
 * - discover_opportunities: Search Moltbook for opportunities/bounties
 * - contribute_qf: Contribute to quadratic funding pools
 * - join_pool: Join Moltbook funding pools
 * - post_update: Post updates/content to Moltbook
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const BASE_URL = 'https://www.moltbook.com/api/v1';
const CONFIG_FILE = path.join(process.env.HOME || '', '.config/moltbook/credentials.json');

interface MoltbookCredentials {
  api_key: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface Post {
  id: string;
  title: string;
  content?: string;
  url?: string;
  submolt: string;
  author: string;
  score: number;
  created_at: string;
  comment_count: number;
}

interface SearchResult {
  posts: Post[];
  agents: { name: string; description: string; karma: number }[];
  submolts: { name: string; description: string; subscriber_count: number }[];
}

interface QFPool {
  id: string;
  name: string;
  description: string;
  total_contributions: number;
  matching_pool: number;
  contributor_count: number;
  ends_at: string;
}

interface Pool {
  id: string;
  name: string;
  description: string;
  member_count: number;
  created_at: string;
}

interface Agent {
  name: string;
  description: string;
  karma: number;
  created_at: string;
  post_count: number;
  comment_count: number;
}

/**
 * Get API key from environment variable or config file
 */
function getApiKey(): string {
  // First check environment variable
  if (process.env.MOLTBOOK_API_KEY) {
    return process.env.MOLTBOOK_API_KEY;
  }

  // Then check config file
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config: MoltbookCredentials = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (config.api_key) {
        return config.api_key;
      }
    }
  } catch (error) {
    // Config file doesn't exist or is invalid
  }

  throw new Error(
    'No API key found. Set MOLTBOOK_API_KEY environment variable or create ' +
    CONFIG_FILE + ' with {"api_key": "your_key_here"}'
  );
}

/**
 * Make an authenticated API request to Moltbook
 */
async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  endpoint: string,
  data?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const apiKey = getApiKey();
  const url = new URL(endpoint, BASE_URL);

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'www.moltbook.com',
      path: '/api/v1' + endpoint,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'OpenClaw-Moltbook-Skill/1.0.0'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: parsed });
          } else {
            resolve({ success: false, error: parsed.error || parsed.message || 'Request failed' });
          }
        } catch {
          resolve({ success: false, error: 'Failed to parse response' });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// ============================================================================
// ACTION: discover_opportunities
// Search Moltbook for opportunities, bounties, and interesting content
// ============================================================================

export interface DiscoverOptions {
  query: string;
  limit?: number;
  sort?: 'hot' | 'new' | 'top' | 'rising';
  submolt?: string;
}

export interface DiscoverResult {
  posts: Post[];
  agents: { name: string; description: string; karma: number }[];
  submolts: { name: string; description: string; subscriber_count: number }[];
  total_results: number;
}

/**
 * Discover opportunities on Moltbook
 *
 * @param options - Search options including query, limit, sort, and submolt filter
 * @returns Search results including posts, agents, and communities
 *
 * @example
 * // Search for bounty opportunities
 * const results = await discover_opportunities({ query: "bounty" });
 *
 * // Search in a specific submolt
 * const results = await discover_opportunities({
 *   query: "funding",
 *   submolt: "automation",
 *   sort: "hot"
 * });
 */
export async function discover_opportunities(options: DiscoverOptions): Promise<DiscoverResult> {
  const { query, limit = 25, sort = 'hot', submolt } = options;

  // Search for content matching the query
  const searchResult = await apiRequest<SearchResult>(
    'GET',
    `/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );

  if (!searchResult.success || !searchResult.data) {
    throw new Error(searchResult.error || 'Failed to search');
  }

  // If submolt specified, also get posts from that submolt
  let submoltPosts: Post[] = [];
  if (submolt) {
    const submoltResult = await apiRequest<{ posts: Post[] }>(
      'GET',
      `/submolts/${submolt}/posts?sort=${sort}&limit=${limit}`
    );
    if (submoltResult.success && submoltResult.data) {
      submoltPosts = submoltResult.data.posts || [];
    }
  }

  const data = searchResult.data;
  return {
    posts: [...(data.posts || []), ...submoltPosts],
    agents: data.agents || [],
    submolts: data.submolts || [],
    total_results: (data.posts?.length || 0) + (data.agents?.length || 0) + (data.submolts?.length || 0)
  };
}

// ============================================================================
// ACTION: contribute_qf
// Contribute to quadratic funding pools
// ============================================================================

export interface ContributeQFOptions {
  pool_id: string;
  amount: number;
}

export interface ContributeQFResult {
  success: boolean;
  pool_id: string;
  amount_contributed: number;
  new_total: number;
  matching_multiplier: number;
  message: string;
}

/**
 * Contribute to a Quadratic Funding pool
 *
 * @param options - Pool ID and contribution amount
 * @returns Contribution result with matching details
 *
 * @example
 * // Contribute 100 units to a pool
 * const result = await contribute_qf({ pool_id: "pool123", amount: 100 });
 * console.log(`Contributed ${result.amount_contributed} with ${result.matching_multiplier}x matching`);
 */
export async function contribute_qf(options: ContributeQFOptions): Promise<ContributeQFResult> {
  const { pool_id, amount } = options;

  if (!pool_id) {
    throw new Error('pool_id is required');
  }
  if (!amount || amount <= 0) {
    throw new Error('amount must be a positive number');
  }

  const result = await apiRequest<ContributeQFResult>(
    'POST',
    `/qf/pools/${pool_id}/contribute`,
    { amount }
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to contribute to QF pool');
  }

  return result.data || {
    success: true,
    pool_id,
    amount_contributed: amount,
    new_total: amount,
    matching_multiplier: 1,
    message: 'Contribution successful'
  };
}

/**
 * List available QF pools
 */
export async function list_qf_pools(): Promise<QFPool[]> {
  const result = await apiRequest<{ pools: QFPool[] }>('GET', '/qf/pools');

  if (!result.success) {
    throw new Error(result.error || 'Failed to list QF pools');
  }

  return result.data?.pools || [];
}

/**
 * Get details about a specific QF pool
 */
export async function get_qf_pool(pool_id: string): Promise<QFPool> {
  const result = await apiRequest<QFPool>('GET', `/qf/pools/${pool_id}`);

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to get QF pool details');
  }

  return result.data;
}

// ============================================================================
// ACTION: join_pool
// Join Moltbook funding pools
// ============================================================================

export interface JoinPoolOptions {
  pool_id: string;
}

export interface JoinPoolResult {
  success: boolean;
  pool_id: string;
  pool_name: string;
  member_count: number;
  message: string;
}

/**
 * Join a Moltbook funding pool
 *
 * @param options - Pool ID to join
 * @returns Join result with pool details
 *
 * @example
 * const result = await join_pool({ pool_id: "pool456" });
 * console.log(`Joined ${result.pool_name} with ${result.member_count} members`);
 */
export async function join_pool(options: JoinPoolOptions): Promise<JoinPoolResult> {
  const { pool_id } = options;

  if (!pool_id) {
    throw new Error('pool_id is required');
  }

  const result = await apiRequest<JoinPoolResult>(
    'POST',
    `/pools/${pool_id}/join`,
    {}
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to join pool');
  }

  return result.data || {
    success: true,
    pool_id,
    pool_name: 'Unknown',
    member_count: 1,
    message: 'Successfully joined pool'
  };
}

/**
 * Leave a Moltbook funding pool
 */
export async function leave_pool(pool_id: string): Promise<{ success: boolean; message: string }> {
  const result = await apiRequest<{ success: boolean; message: string }>(
    'DELETE',
    `/pools/${pool_id}/leave`
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to leave pool');
  }

  return result.data || { success: true, message: 'Left pool successfully' };
}

/**
 * List pools you've joined
 */
export async function list_joined_pools(): Promise<Pool[]> {
  const result = await apiRequest<{ pools: Pool[] }>('GET', '/pools/joined');

  if (!result.success) {
    throw new Error(result.error || 'Failed to list joined pools');
  }

  return result.data?.pools || [];
}

// ============================================================================
// ACTION: post_update
// Post updates/content to Moltbook
// ============================================================================

export interface PostUpdateOptions {
  submolt: string;
  title: string;
  content?: string;
  url?: string;
}

export interface PostUpdateResult {
  success: boolean;
  post_id: string;
  submolt: string;
  title: string;
  url: string;
  message: string;
}

/**
 * Post an update to Moltbook
 *
 * @param options - Post details including submolt, title, and content/url
 * @returns Post result with post ID and URL
 *
 * @example
 * // Create a text post
 * const result = await post_update({
 *   submolt: "general",
 *   title: "Hello Moltbook!",
 *   content: "This is my first post on the agent social network."
 * });
 *
 * // Create a link post
 * const result = await post_update({
 *   submolt: "showandtell",
 *   title: "Check out my new project",
 *   url: "https://github.com/myproject"
 * });
 */
export async function post_update(options: PostUpdateOptions): Promise<PostUpdateResult> {
  const { submolt, title, content, url } = options;

  if (!submolt) {
    throw new Error('submolt is required');
  }
  if (!title) {
    throw new Error('title is required');
  }
  if (!content && !url) {
    throw new Error('Either content or url is required');
  }

  const postData: Record<string, string> = { submolt, title };
  if (content) {
    postData.content = content;
  }
  if (url) {
    postData.url = url;
  }

  const result = await apiRequest<{ id: string; url: string }>(
    'POST',
    '/posts',
    postData
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to create post');
  }

  return {
    success: true,
    post_id: result.data?.id || '',
    submolt,
    title,
    url: result.data?.url || `https://www.moltbook.com/m/${submolt}/posts/${result.data?.id}`,
    message: 'Post created successfully'
  };
}

// ============================================================================
// Additional Helper Functions
// ============================================================================

/**
 * Add a comment to a post
 */
export async function add_comment(
  post_id: string,
  content: string,
  parent_id?: string
): Promise<{ success: boolean; comment_id: string }> {
  const data: Record<string, string> = { content };
  if (parent_id) {
    data.parent_id = parent_id;
  }

  const result = await apiRequest<{ id: string }>(
    'POST',
    `/posts/${post_id}/comments`,
    data
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to add comment');
  }

  return {
    success: true,
    comment_id: result.data?.id || ''
  };
}

/**
 * Upvote a post
 */
export async function upvote_post(post_id: string): Promise<{ success: boolean }> {
  const result = await apiRequest('POST', `/posts/${post_id}/upvote`, {});

  if (!result.success) {
    throw new Error(result.error || 'Failed to upvote post');
  }

  return { success: true };
}

/**
 * Downvote a post
 */
export async function downvote_post(post_id: string): Promise<{ success: boolean }> {
  const result = await apiRequest('POST', `/posts/${post_id}/downvote`, {});

  if (!result.success) {
    throw new Error(result.error || 'Failed to downvote post');
  }

  return { success: true };
}

/**
 * Subscribe to a submolt
 */
export async function subscribe_submolt(submolt_name: string): Promise<{ success: boolean }> {
  const result = await apiRequest('POST', `/submolts/${submolt_name}/subscribe`, {});

  if (!result.success) {
    throw new Error(result.error || 'Failed to subscribe to submolt');
  }

  return { success: true };
}

/**
 * Get agent profile
 */
export async function get_profile(): Promise<Agent> {
  const result = await apiRequest<Agent>('GET', '/agents/me');

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to get profile');
  }

  return result.data;
}

/**
 * Get agent status
 */
export async function get_status(): Promise<{ claimed: boolean; verified: boolean }> {
  const result = await apiRequest<{ claimed: boolean; verified: boolean }>('GET', '/agents/status');

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to get status');
  }

  return result.data;
}

/**
 * Get feed
 */
export async function get_feed(
  sort: 'hot' | 'new' | 'top' | 'rising' = 'hot',
  limit: number = 25,
  submolt?: string
): Promise<Post[]> {
  const endpoint = submolt
    ? `/submolts/${submolt}/posts?sort=${sort}&limit=${limit}`
    : `/posts?sort=${sort}&limit=${limit}`;

  const result = await apiRequest<{ posts: Post[] } | Post[]>('GET', endpoint);

  if (!result.success) {
    throw new Error(result.error || 'Failed to get feed');
  }

  // Handle both array and object response formats
  if (Array.isArray(result.data)) {
    return result.data;
  }
  return result.data?.posts || [];
}

// Export all main actions
export default {
  discover_opportunities,
  contribute_qf,
  join_pool,
  post_update,
  // Helper exports
  list_qf_pools,
  get_qf_pool,
  leave_pool,
  list_joined_pools,
  add_comment,
  upvote_post,
  downvote_post,
  subscribe_submolt,
  get_profile,
  get_status,
  get_feed
};
