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

- Build Command: `pip install -r app/requirements.txt`
- Start Command: `python start.py`
- Root Directory: project root (leave empty)
- Health Check Path: `/health`

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

## Deployment Issues Fixed

- Added missing `__init__.py` files for proper Python package structure
- Fixed relative import paths in all router files
- Updated database connection handling for production environments
- Added SSL configuration for Render PostgreSQL connections
- Created proper startup script (`start.py`) for Render deployment
- Added health check endpoint (`/health`) for Render monitoring
- Fixed CORS configuration for production environments
- Updated requirements.txt with specific version numbers
- Added render.yaml configuration file
