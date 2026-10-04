from datetime import datetime

from app.common.schemas import ApiModel
from app.users.models import Role


class UserResponse(ApiModel):
    id: int
    email: str
    name: str
    role: Role
    created_at: datetime
