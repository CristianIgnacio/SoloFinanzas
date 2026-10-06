"""Legacy unit fixtures share one explicit owner; API tests use TenantSession."""
from uuid import UUID
from sqlalchemy import event
from sqlmodel import Session as BaseSession
from app.models.user import UserModel, OwnedModel

OWNER = UUID("11111111-1111-4111-8111-111111111111")

class Session(BaseSession):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.get(UserModel, OWNER) is None:
            self.add(UserModel(id=OWNER))
            self.commit()

@event.listens_for(Session, "before_flush")
def fixture_owner(session, *_):
    for item in session.new:
        if isinstance(item, OwnedModel) and item.user_id is None:
            item.user_id = OWNER
