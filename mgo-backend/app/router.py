from fastapi import APIRouter

from app.modules.identity.api import router as identity_router
from app.modules.billing.api import router as billing_router
from app.modules.knowledge.api import router as knowledge_router
from app.modules.embedding.api import router as embedding_router
from app.modules.retrieval.api import router as retrieval_router
from app.modules.agent.api import router as agent_router
from app.modules.chat.api import router as chat_router
from app.modules.platform.api import router as platform_router

api_router = APIRouter()

api_router.include_router(identity_router, prefix="/identity", tags=["identity"])
api_router.include_router(billing_router, prefix="/billing", tags=["billing"])
api_router.include_router(knowledge_router, prefix="/knowledge", tags=["knowledge"])
api_router.include_router(embedding_router, prefix="/embedding", tags=["embedding"])
api_router.include_router(retrieval_router, prefix="/retrieval", tags=["retrieval"])
api_router.include_router(agent_router, prefix="/agent", tags=["agent"])
api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
api_router.include_router(platform_router, prefix="/platform", tags=["platform"])