import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.session import get_session
from api.schemas.test_scenario import TestScenarioCreate, TestScenarioRead, TestScenarioUpdate
from api.services import project_service, test_scenario_service

router = APIRouter(tags=["test-scenarios"])


@router.post(
    "/api/projects/{project_id}/test-scenarios",
    response_model=TestScenarioRead,
    status_code=201,
)
async def create_test_scenario(
    project_id: uuid.UUID,
    body: TestScenarioCreate,
    session: AsyncSession = Depends(get_session),
):
    project = await project_service.get_by_id(session, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    scenario = await test_scenario_service.create(session, project_id, body)
    return scenario


@router.get(
    "/api/projects/{project_id}/test-scenarios",
    response_model=list[TestScenarioRead],
)
async def list_test_scenarios(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    project = await project_service.get_by_id(session, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return await test_scenario_service.list_by_project(session, project_id)


@router.get("/api/test-scenarios/{scenario_id}", response_model=TestScenarioRead)
async def get_test_scenario(
    scenario_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    scenario = await test_scenario_service.get_by_id(session, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Test scenario not found")
    return scenario


@router.put("/api/test-scenarios/{scenario_id}", response_model=TestScenarioRead)
async def update_test_scenario(
    scenario_id: uuid.UUID,
    body: TestScenarioUpdate,
    session: AsyncSession = Depends(get_session),
):
    scenario = await test_scenario_service.update(session, scenario_id, body)
    if not scenario:
        raise HTTPException(status_code=404, detail="Test scenario not found")
    return scenario


@router.delete("/api/test-scenarios/{scenario_id}", status_code=204)
async def delete_test_scenario(
    scenario_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    deleted = await test_scenario_service.delete(session, scenario_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Test scenario not found")
