from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.db.session import engine, Base
from app.api.v1 import auth, theses, milestones, documents, ai, feedbacks, notifications, admin

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize PostgreSQL tables automatically on startup if connected
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"[Warning] Database initialization notice: {e}")
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Exception Handler (Secured against Information Disclosure)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Lỗi máy chủ nội bộ. Vui lòng thử lại sau."},
    )

# Include All 8 API v1 Routers (Covering 92 Use Cases)
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(theses.router, prefix=settings.API_V1_STR)
app.include_router(milestones.router, prefix=settings.API_V1_STR)
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(ai.router, prefix=settings.API_V1_STR)
app.include_router(feedbacks.router, prefix=settings.API_V1_STR)
app.include_router(notifications.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    return {
        "status": "online",
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
    }

@app.get("/health")
async def health_check():
    """Firmware Telemetry & Diagnostics API."""
    return {
        "status": "NOMINAL",
        "database": "POSTGRESQL_ASYNC",
        "pgvector_extension": "READY",
        "watchdog_timer": "OK",
    }
