// Look-only preview (restyle-preview branch, Msg #264).
// Vercel runs this before every /api request. On a preview deployment it refuses them all, so nothing on a preview
// can reach METRC, QuickBooks, Business Central, email, push or the database through the server functions.
// On the live site (VERCEL_ENV=production) it returns nothing and the request goes through untouched.
export const config = { matcher: '/api/:path*' }

export default function middleware() {
  if (process.env.VERCEL_ENV === 'preview') {
    return new Response(JSON.stringify({ message: 'Preview: look only, nothing was saved' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
