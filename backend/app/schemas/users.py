from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import (
    AnyPassword,
    EmailAddress,
    LoginEmail,
    NewPassword,
    UtcTimestamp,
    required_text,
)

FullName = required_text(100)
RoleName = Literal["grower", "specialist"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: str
    research_consent: bool
    research_consent_at: UtcTimestamp | None
    # Specialists only: "approved" once the Nabta team has approved the account, otherwise "pending"
    # (no review cases until then). Always null for growers.
    specialist_status: Literal["approved", "pending"] | None
    approved_at: UtcTimestamp | None
    created_at: UtcTimestamp


class RegisterIn(BaseModel):
    full_name: FullName
    email: EmailAddress
    password: NewPassword
    role: RoleName = "grower"


class LoginIn(BaseModel):
    email: LoginEmail
    password: AnyPassword
    # The workspace the person chose on the sign-in screen; must match the account.
    role: RoleName | None = None


class ResetRequestIn(BaseModel):
    email: EmailAddress


class ResetConfirmIn(BaseModel):
    token: str = Field(min_length=1, max_length=200)
    new_password: NewPassword


class AccountUpdateIn(BaseModel):
    """Omitted fields stay as they are."""

    full_name: FullName | None = None
    email: EmailAddress | None = None


class PasswordChangeIn(BaseModel):
    current_password: AnyPassword
    new_password: NewPassword
