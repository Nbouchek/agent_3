# Comm App MVP

## Backend

- Framework: FastAPI
- URL: https://comm-app-backend.onrender.com

### Environment Variables (Render)
- `DATABASE_URL`: Postgres connection string (Render Postgres → External Connection). Example:
  `postgresql://USER:PASSWORD@HOST:PORT/DBNAME`
- `SECRET_KEY`: A long random string for JWT
- `STRIPE_API_KEY`: Your Stripe secret key (test or live)

### Render Service Settings
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Root Directory: project root (leave empty)

### Local Development
- Create `.env` with:
  - `DATABASE_URL=postgresql://localhost/db` (or your local db)
  - `SECRET_KEY=changeme`
  - `STRIPE_API_KEY=sk_test_...`
- Run: `uvicorn app.main:app --reload`

## Frontends
- Mobile: `/frontend` (Expo)
- Desktop: `/desktop` (React + Electron)

## Tests
- Run: `pytest`
