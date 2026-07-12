const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface ClerkGlobal {
  session?: { getToken: () => Promise<string | null> } | null;
}

// The bearer token is Clerk's session JWT — the app never mints its own.
async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const clerk = (window as { Clerk?: ClerkGlobal }).Clerk;
  if (!clerk?.session) return null;
  try {
    return await clerk.session.getToken();
  } catch {
    return null;
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.formData ? 'POST' : 'GET'),
    headers,
    body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const parsed = (await res.json()) as { message?: string };
      if (parsed.message) message = String(parsed.message);
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export interface Me {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  locale: 'so' | 'en';
  roles: {
    customer: boolean;
    owner: boolean;
    agencyMemberships: Array<{ agencyId: string; role: 'admin' | 'agent'; canVerify: boolean }>;
    platformAdmin: boolean;
  };
}
