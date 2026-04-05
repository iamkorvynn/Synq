export async function GET() {
  return Response.json({
    ok: true,
    service: "synq-web",
    at: new Date().toISOString(),
  });
}
