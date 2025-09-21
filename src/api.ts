// // src/api.ts
// export async function login(username: string, password: string) {
//     const resp = await fetch('https://aicdb.carscan.ai/aicdb/auth/login', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
//         body: new URLSearchParams({ username, password }).toString(),
//     });

//     if (!resp.ok) {
//         const text = await resp.text().catch(() => '');
//         throw new Error(`Login failed (${resp.status}): ${text || resp.statusText}`);
//     }

//     const data = await resp.json().catch(() => ({}));
//     // Try common shapes: {access_token}, {token}, raw string, etc.
//     const token =
//         data?.access_token ??
//         data?.token ??
//         data?.jwt ??
//         (typeof data === 'string' ? data : null);

//     if (!token) throw new Error('No token in response');
//     return token as string;
// }


// src/api.ts
export interface AicdbAuthResponse {
    access_token: string;
    expires_in: number;            // seconds (e.g., 1209600)
    refresh_expires_in: number;    // seconds (e.g., 1800)
    refresh_token: string;
    token_type: 'Bearer' | string; // usually "Bearer"
    id_token?: string;
    'not-before-policy'?: number;
    session_state?: string;
    scope?: string;                // e.g., "openid email profile"
}

export interface LoginResult {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    idToken?: string;
    scope?: string;
    expiresAt: number;        // epoch ms = now + expires_in*1000
    refreshExpiresAt: number; // epoch ms = now + refresh_expires_in*1000
    raw: AicdbAuthResponse;   // keep the full payload if needed
}

export async function login(username: string, password: string): Promise<LoginResult> {
    const body = new URLSearchParams({ username, password });

    const resp = await fetch('https://aicdb.carscan.ai/aicdb/auth/login', {
    // const resp = await fetch('https://4be6cdff32cb.ngrok-free.app/aicdb/auth/login', {
        method: 'POST',
        headers: {
            // These are "simple" headers; they won’t cause a CORS preflight by themselves.
            // 'Content-Type': 'application/x-www-form-urlencoded',
            'accept': 'application/json',
            // 'ngrok-skip-browser-warning': '69420'
        },
        body: body,
        // credentials: 'include', // only if the server uses cookies (not needed here)
        // mode: 'cors',
    });

    console.log(resp);
    

    if (!resp.ok) {
        const text = await resp;
        debugger
        console.log(text);
        
        throw new Error(`Login failed (${resp.status}): ${text || resp.statusText}`);
    }

    const data = (await resp.json()) as AicdbAuthResponse;

    if (!data?.access_token) {
        throw new Error('No access_token in response');
    }

    const now = Date.now();
    const expiresAt = now + (data.expires_in ?? 0) * 1000;
    const refreshExpiresAt = now + (data.refresh_expires_in ?? 0) * 1000;

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type,
        idToken: data.id_token,
        scope: data.scope,
        expiresAt,
        refreshExpiresAt,
        raw: data,
    };
}


export async function getPresignedUrl(imageId: number | string, token: string) {
    const url = `https://aicdb.carscan.ai/aicdb/imagesdata/${imageId}/presign_url`;
    const resp = await fetch(url, {
        headers: {
            accept: 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });

    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Presign failed (${resp.status}): ${text || resp.statusText}`);
    }

    const data = await resp.json();
    // API shape given: { success: true, url: "https://s3..." }
    if (!data?.url) throw new Error('No presigned url in response');
    return String(data.url);
}
