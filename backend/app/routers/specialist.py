"""US08: the specialist workspace. Only specialist accounts may enter."""

from fastapi import APIRouter

from app.deps import Specialist

router = APIRouter(prefix="/api/specialist", tags=["specialist"])


@router.get("/cases")
def list_cases(specialist: Specialist) -> list[dict]:
    # Review requests (US12) and the queue behind them (US14) are built in Sprint 2.
    return []
