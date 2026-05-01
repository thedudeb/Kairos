"""Re-export all SQLModel entities so Alembic's autogenerate sees them.

Order matters slightly: child tables import parent foreign-key strings, so
parents must be importable. SQLModel handles deferred resolution but we
explicitly import everything here for clarity.
"""
from app.models.user import User  # noqa: F401
from app.models.user_invite import UserInvite  # noqa: F401
from app.models.template import (  # noqa: F401
    Template,
    TemplateAssessmentQuestion,
    TemplateFormField,
)
from app.models.job import (  # noqa: F401
    Job,
    JobAssessmentQuestion,
    JobFormField,
)
from app.models.pipeline import (  # noqa: F401
    PipelineStage,
    StageTransition,
)
from app.models.applicant import (  # noqa: F401
    Applicant,
    ApplicantCustomFieldValue,
    ApplicantEducation,
    ApplicantFitScore,
    ApplicantNote,
    ApplicantSkill,
    ApplicantWork,
    ParsedResume,
)
from app.models.integration import (  # noqa: F401
    JobIntegration,
    WebhookDelivery,
)
