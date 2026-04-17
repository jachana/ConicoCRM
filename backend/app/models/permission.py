from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class PermissionOverride(Base):
    __tablename__ = "permission_overrides"
    __table_args__ = (UniqueConstraint("user_id", "module", "action"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    module: Mapped[str] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(20))  # view | create | edit | delete
    allowed: Mapped[bool] = mapped_column(Boolean)
