# Deployment recommendations

Editah is a Vite/React application with an Express server, authentication, uploads and backend services.

## Recommended option

Use **Google Cloud Run** for the combined Node service and configure Firebase credentials and `GEMINI_API_KEY` through Secret Manager. **Render** is the simplest alternative; **Railway** or **Fly.io** work well for a persistent Node service.

Because Editah handles uploads and authentication, do not use a static host for the API. Configure CORS, rate limits, secure cookies, HTTPS and durable object storage before production.
