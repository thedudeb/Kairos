"""Demo seed script.

Creates three active jobs with realistic applicants distributed across all
pipeline stages, with full parsed-resume data so every chart and dashboard
view looks populated.

  1. Senior Software Engineer  — 30 applicants
  2. Product Designer          — 20 applicants
  3. QA Analyst                — 15 applicants

Usage:
    cd backend
    uv run python scripts/seed.py

Re-running is safe — it detects and skips already-seeded data.
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

sys.path.insert(0, str(Path(__file__).parent.parent))

import os
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/recruitment")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("AUTH_SECRET", "local-dev-only-replace-me-in-prod-1234567890abcdef")
os.environ.setdefault("INTERNAL_API_KEY", "local-dev-internal-key-replace-me-in-prod-1234567890abcdef")
os.environ.setdefault("INITIAL_ADMIN_EMAIL", "you@example.com")

from sqlmodel import Session, select

from app.db import engine
from app.models._base import FieldType, JobStatus, ParseStatus
from app.models.applicant import (
    Applicant,
    ApplicantEducation,
    ApplicantNote,
    ApplicantSkill,
    ApplicantWork,
    ParsedResume,
)
from app.models.job import Job, JobFormField
from app.models.pipeline import PipelineStage
from app.models.user import User

# ─── Shared skill pools ───────────────────────────────────────────────────────

SKILLS = {
    "ml":       ["Python", "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "SQL", "Docker", "Kubernetes", "GCP"],
    "backend":  ["Python", "Go", "PostgreSQL", "Redis", "Docker", "Kubernetes", "REST APIs", "gRPC", "Kafka", "AWS"],
    "fullstack":["TypeScript", "React", "Next.js", "Node.js", "PostgreSQL", "GraphQL", "Docker", "CSS", "REST APIs", "AWS"],
    "devops":   ["Kubernetes", "Terraform", "AWS", "GCP", "Docker", "CI/CD", "Python", "Bash", "Prometheus", "Grafana"],
    "data":     ["Python", "SQL", "Spark", "dbt", "Airflow", "Snowflake", "Pandas", "Looker", "BigQuery", "Tableau"],
    "mobile":   ["Swift", "Kotlin", "React Native", "iOS SDK", "Android SDK", "Xcode", "CI/CD", "REST APIs", "Firebase"],
    "design":   ["Figma", "Sketch", "Prototyping", "User Research", "Design Systems", "Accessibility", "Adobe XD", "Framer", "Illustration"],
    "qa":       ["Selenium", "Cypress", "Jest", "Pytest", "Test Planning", "API Testing", "Postman", "SQL", "CI/CD", "JIRA"],
}

NOTE_BODIES = [
    "Strong technical background, worth fast-tracking.",
    "Good culture fit, references pending.",
    "Impressive portfolio.",
    "Reached out directly — very motivated.",
    "Previous intern here — familiar with our stack.",
    "Referred by the hiring manager.",
    "Great communication skills in screening call.",
    "Showed strong problem-solving in take-home.",
]


def random_submitted_at(stage_idx: int) -> datetime:
    now = datetime.now(timezone.utc)
    max_days = max(3, stage_idx * 5)
    min_days = max(0, stage_idx * 3)
    days_ago = random.uniform(min_days, max_days)
    return now - timedelta(days=days_ago, hours=random.uniform(0, 12))


def make_parsed_resume(
    applicant_id: UUID,
    first: str, last: str, email: str,
    institution: str, degree: str,
    company: str, title: str, skills_key: str,
) -> tuple[ParsedResume, list[ApplicantEducation], list[ApplicantWork], list[ApplicantSkill]]:
    skills_list = SKILLS[skills_key]

    pr = ParsedResume(
        applicant_id=applicant_id,
        full_name=f"{first} {last}",
        email=email,
        phone=f"+1 ({random.randint(200,999)}) {random.randint(100,999)}-{random.randint(1000,9999)}",
        top_institution=institution,
        top_degree=degree,
        raw_json={
            "full_name": f"{first} {last}",
            "email": email,
            "top_institution": institution,
            "top_degree": degree,
            "skills": skills_list,
        },
        confidence_notes=None,
    )

    grad_year = random.randint(2014, 2022)
    education = [
        ApplicantEducation(
            applicant_id=applicant_id,
            institution=institution,
            degree=degree,
            field_of_study=degree.split(" ", 1)[-1] if " " in degree else None,
            start_year=grad_year - 4 if "BSc" in degree or "MEng" in degree else grad_year - 2,
            end_year=grad_year,
            sort_order=0,
        )
    ]

    start_year = grad_year
    end_year = random.randint(start_year + 1, 2025)
    work = [
        ApplicantWork(
            applicant_id=applicant_id,
            company=company,
            title=title,
            start_date=f"{start_year}-{random.randint(1,12):02d}",
            end_date="present",
            description=f"Built and shipped impactful work at {company}.",
            sort_order=0,
        )
    ]

    skill_rows = [ApplicantSkill(applicant_id=applicant_id, skill=s) for s in skills_list]
    return pr, education, work, skill_rows


def seed_job(
    session: Session,
    title: str,
    slug: str,
    description_md: str,
    stages_spec: list[tuple[str, int, bool]],
    form_fields: list[tuple[str, str, bool]],
    applicants_data: list[tuple],
    pending_parse_ratio: float = 0.15,
    admin: User | None = None,
    status: JobStatus = JobStatus.active,
) -> None:
    # Skip if already seeded
    existing = session.exec(select(Job).where(Job.slug == slug)).first()
    if existing:
        print(f"  ✓ {title} — already seeded, skipping")
        return

    job = Job(title=title, slug=slug, description_md=description_md, status=status)
    session.add(job)
    session.flush()

    stages: list[PipelineStage] = []
    for name, order, is_terminal in stages_spec:
        s = PipelineStage(job_id=job.id, name=name, sort_order=order, is_terminal=is_terminal)
        session.add(s)
        stages.append(s)

    for i, (label, ftype, required) in enumerate(form_fields):
        session.add(JobFormField(
            job_id=job.id,
            label=label,
            field_type=FieldType(ftype),
            is_required=required,
            sort_order=i,
        ))

    session.flush()

    stage_count = len(stages)
    for i, row in enumerate(applicants_data):
        first, last, email, institution, degree, company, job_title, skills_key = row
        stage_idx = min(i % stage_count, stage_count - 1)
        stage = stages[stage_idx]
        submitted_at = random_submitted_at(stage_idx)
        parse_status = ParseStatus.pending if random.random() < pending_parse_ratio else ParseStatus.parsed

        applicant = Applicant(
            job_id=job.id,
            current_stage_id=stage.id,
            first_name=first,
            last_name=last,
            email=email,
            phone=f"+1 ({random.randint(200,999)}) {random.randint(100,999)}-{random.randint(1000,9999)}",
            resume_gcs_path=f"local:///tmp/recruitment-uploads/demo_{slug}_{i}.pdf",
            parse_status=parse_status,
            submitted_at=submitted_at,
        )
        session.add(applicant)
        session.flush()

        if parse_status == ParseStatus.parsed:
            pr, edu, work, skills = make_parsed_resume(
                applicant.id, first, last, email, institution, degree, company, job_title, skills_key,
            )
            session.add(pr)
            for e in edu: session.add(e)
            for w in work: session.add(w)
            for s in skills: session.add(s)

        if i % 4 == 0 and admin:
            session.add(ApplicantNote(
                applicant_id=applicant.id,
                author_id=admin.id,
                body=random.choice(NOTE_BODIES),
            ))

    session.commit()
    print(f"  ✓ {title} — {len(applicants_data)} applicants, {len(stages)} stages")


# ─── Job definitions ──────────────────────────────────────────────────────────

SWE_STAGES = [
    ("Applied",     0, False),
    ("Screening",   1, False),
    ("Assessment",  2, False),
    ("Interview",   3, False),
    ("Offer",       4, False),
    ("Hired",       5, True),
    ("Rejected",    6, True),
]

DESIGNER_STAGES = [
    ("Applied",         0, False),
    ("Portfolio Review",1, False),
    ("Design Challenge",2, False),
    ("Interview",       3, False),
    ("Hired",           4, True),
    ("Rejected",        5, True),
]

QA_STAGES = [
    ("Applied",     0, False),
    ("Phone Screen",1, False),
    ("Technical",   2, False),
    ("Offer",       3, False),
    ("Hired",       4, True),
    ("Rejected",    5, True),
]

SWE_APPLICANTS = [
    ("Emily",    "Chen",       "emily.chen@gmail.com",        "MIT",                    "MSc Computer Science",       "Google",    "Senior SWE",               "ml"),
    ("Marcus",   "Johnson",    "marcus.j@outlook.com",        "Georgia Tech",           "BSc Computer Science",       "Amazon",    "Software Engineer II",     "backend"),
    ("Priya",    "Sharma",     "priya.sharma@yahoo.com",      "Stanford University",    "PhD Machine Learning",       "DeepMind",  "Research Engineer",        "ml"),
    ("David",    "Kim",        "david.kim@proton.me",         "UC Berkeley",            "BSc EECS",                   "Stripe",    "Backend Engineer",         "backend"),
    ("Sarah",    "O'Brien",    "sarah.obrien@gmail.com",      "University of Waterloo", "BSc Software Engineering",   "Shopify",   "Full Stack Engineer",      "fullstack"),
    ("James",    "Wilson",     "jwilson@icloud.com",          "Carnegie Mellon",        "MSc Software Engineering",   "Uber",      "Staff Engineer",           "backend"),
    ("Fatima",   "Al-Hassan",  "fatima.ah@gmail.com",         "Imperial College London","MEng Computing",             "Meta",      "Software Engineer",        "fullstack"),
    ("Michael",  "Torres",     "m.torres@gmail.com",          "UT Austin",              "BSc Computer Science",       "Datadog",   "Infrastructure Engineer",  "devops"),
    ("Aisha",    "Patel",      "aisha.patel@outlook.com",     "University of Toronto",  "MSc Data Science",           "Palantir",  "Data Engineer",            "data"),
    ("Ryan",     "Murphy",     "ryan.murphy@gmail.com",       "NYU",                    "BSc Computer Science",       "Twilio",    "API Engineer",             "backend"),
    ("Mei",      "Zhang",      "mei.zhang@gmail.com",         "ETH Zurich",             "MSc Computer Science",       "Apple",     "iOS Engineer",             "mobile"),
    ("Carlos",   "Reyes",      "c.reyes@gmail.com",           "Columbia University",    "BSc Computer Engineering",   "Netflix",   "Platform Engineer",        "devops"),
    ("Nina",     "Johansson",  "nina.j@hotmail.com",          "KTH Royal Institute",    "MSc Software Engineering",   "Spotify",   "Backend Engineer",         "backend"),
    ("Omar",     "Hassan",     "omar.hassan@gmail.com",       "Cairo University",       "BSc Computer Science",       "Microsoft", "SDE II",                   "fullstack"),
    ("Chloe",    "Dubois",     "chloe.dubois@gmail.com",      "École Polytechnique",    "MEng Computer Science",      "Criteo",    "ML Engineer",              "ml"),
    ("Lucas",    "Andrade",    "l.andrade@gmail.com",         "USP",                    "BSc Computer Engineering",   "Nubank",    "Backend Engineer",         "backend"),
    ("Sofia",    "Rossi",      "sofia.rossi@gmail.com",       "Politecnico di Milano",  "MSc Computer Engineering",   "Bending Spoons","iOS Engineer",         "mobile"),
    ("Ethan",    "Brown",      "ethan.b@gmail.com",           "University of Michigan", "BSc Computer Science",       "Airbnb",    "Full Stack Engineer",      "fullstack"),
    ("Layla",    "Nasser",     "layla.nasser@gmail.com",      "AUB",                    "MSc Information Systems",    "Careem",    "Platform Engineer",        "backend"),
    ("Jack",     "Thompson",   "j.thompson@outlook.com",      "University of Edinburgh","BSc Informatics",            "Skyscanner","SWE",                      "fullstack"),
    ("Yuki",     "Tanaka",     "yuki.tanaka@gmail.com",       "University of Tokyo",    "MSc Computer Science",       "Mercari",   "Backend Engineer",         "backend"),
    ("Amara",    "Diallo",     "amara.diallo@gmail.com",      "Cheikh Anta Diop",       "BSc Computer Science",       "Wave",      "Software Engineer",        "fullstack"),
    ("Ben",      "Fischer",    "ben.fischer@gmail.com",       "TU Munich",              "MSc Robotics",               "BMW",       "Software Engineer",        "devops"),
    ("Isabella", "Costa",      "i.costa@gmail.com",           "PUC-Rio",                "BSc Computer Science",       "iFood",     "Full Stack Engineer",      "fullstack"),
    ("Noah",     "Williams",   "noah.w@gmail.com",            "University of British Columbia","BSc Computer Science", "Hootsuite","Backend Engineer",         "backend"),
    ("Ava",      "Martinez",   "ava.martinez@gmail.com",      "UCLA",                   "BSc Computer Science",       "SpaceX",    "Software Engineer",        "devops"),
    ("Liam",     "Nguyen",     "liam.nguyen@gmail.com",       "UC San Diego",           "BSc Computer Engineering",   "Qualcomm",  "Systems Engineer",         "devops"),
    ("Zara",     "Ali",        "zara.ali@gmail.com",          "LUMS",                   "BSc Computer Science",       "Careem",    "Software Engineer",        "fullstack"),
    ("Finn",     "O'Sullivan", "finn.os@gmail.com",           "University College Dublin","BSc Computer Science",     "Intercom",  "Backend Engineer",         "backend"),
    ("Maya",     "Goldberg",   "maya.goldberg@gmail.com",     "Hebrew University",      "MSc Computer Science",       "Wix",       "Full Stack Engineer",      "fullstack"),
]

DESIGNER_APPLICANTS = [
    ("Léa",      "Moreau",    "lea.moreau@gmail.com",         "Parsons School of Design","BFA Graphic Design",        "Figma",     "Product Designer",         "design"),
    ("Kai",      "Tanaka",    "kai.tanaka@gmail.com",         "RISD",                   "MFA Industrial Design",      "Airbnb",    "Senior Designer",          "design"),
    ("Alicia",   "Vega",      "alicia.vega@gmail.com",        "ArtCenter",              "BFA Product Design",         "Spotify",   "UX Designer",              "design"),
    ("Tobias",   "Krause",    "tobias.k@gmail.com",           "HfG Ulm",                "Diploma Product Design",     "Braun",     "Design Lead",              "design"),
    ("Nora",     "Bakke",     "nora.bakke@gmail.com",         "Oslo School of Architecture","MSc Interaction Design", "Opera",     "UX Designer",              "design"),
    ("Javier",   "Ramos",     "javier.ramos@gmail.com",       "IED Madrid",             "BA Graphic Design",          "Cabify",    "Visual Designer",          "design"),
    ("Amelia",   "Wright",    "amelia.w@gmail.com",           "Royal College of Art",   "MA Design Products",         "Google",    "Product Designer",         "design"),
    ("Hana",     "Sato",      "hana.sato@gmail.com",          "Tama Art University",    "BFA Design",                 "Mercari",   "UX/UI Designer",           "design"),
    ("Connor",   "MacLeod",   "connor.m@gmail.com",           "Glasgow School of Art",  "BA Graphic Design",          "Skyscanner","UX Designer",              "design"),
    ("Zoe",      "Bernard",   "zoe.bernard@gmail.com",        "Central Saint Martins",  "BA Graphic Design",          "Deliveroo", "Product Designer",         "design"),
    ("Arjun",    "Mehta",     "arjun.mehta@gmail.com",        "NID Ahmedabad",          "BDes Communication Design",  "Swiggy",    "Design Manager",           "design"),
    ("Elisa",    "Fontana",   "elisa.f@gmail.com",            "Politecnico di Milano",  "MSc Communication Design",   "Bending Spoons","Senior Designer",      "design"),
    ("Theo",     "Laurent",   "theo.l@gmail.com",             "ENSAD Paris",            "MA Design",                  "BlaBlaCar", "Product Designer",         "design"),
    ("Rin",      "Yoshida",   "rin.yoshida@gmail.com",        "Keio University",        "BFA Design",                 "Sony",      "UX Designer",              "design"),
    ("Iris",     "De Boer",   "iris.deboer@gmail.com",        "Design Academy Eindhoven","BA Design",                 "Philips",   "Product Designer",         "design"),
    ("Santiago", "Gomez",     "santiago.g@gmail.com",         "Veritas University",     "BA Interaction Design",      "Rappi",     "UX/UI Designer",           "design"),
    ("Chiara",   "Bianchi",   "chiara.b@gmail.com",           "Istituto Europeo di Design","BA Graphic Design",       "Lavazza",   "Brand Designer",           "design"),
    ("Felix",    "Larsson",   "felix.l@gmail.com",            "Konstfack",              "MA Fine Art",                "IKEA",      "Design Researcher",        "design"),
    ("Priscilla","Dubé",      "priscilla.d@gmail.com",        "UQAM",                   "BFA Graphic Design",         "Lightspeed","Product Designer",         "design"),
    ("Rashid",   "Omar",      "rashid.omar@gmail.com",        "American University in Cairo","BA Graphic Design",     "Souq",      "UX Designer",              "design"),
]

QA_APPLICANTS = [
    ("Tyler",    "Barnes",    "tyler.barnes@gmail.com",       "Penn State",             "BSc Information Systems",    "IBM",       "QA Engineer",              "qa"),
    ("Hina",     "Yamamoto",  "hina.y@gmail.com",             "Waseda University",      "BSc Computer Science",       "Rakuten",   "Test Engineer",            "qa"),
    ("Greg",     "Petrov",    "greg.petrov@gmail.com",        "Moscow State University","BSc Math",                   "Yandex",    "SDET",                     "qa"),
    ("Clare",    "Maguire",   "clare.m@gmail.com",            "Trinity College Dublin", "BSc Computer Science",       "Workday",   "QA Lead",                  "qa"),
    ("Bao",      "Tran",      "bao.tran@gmail.com",           "Hanoi University",       "BSc Software Engineering",   "KMS Tech",  "QA Engineer",              "qa"),
    ("Marek",    "Novak",     "marek.n@gmail.com",            "Charles University",     "BSc Computer Science",       "JetBrains", "Test Automation Engineer",  "qa"),
    ("Dina",     "Volkov",    "dina.volkov@gmail.com",        "Tel Aviv University",    "BSc Information Systems",    "Monday.com","QA Manager",               "qa"),
    ("Patrick",  "Osei",      "p.osei@gmail.com",             "University of Ghana",    "BSc Computer Science",       "Jumia",     "QA Engineer",              "qa"),
    ("Nadia",    "Papadopoulos","nadia.p@gmail.com",          "Athens Polytechnic",     "MSc Computer Science",       "Skroutz",   "Automation Engineer",      "qa"),
    ("Ivan",     "Stolarchuk", "ivan.s@gmail.com",            "KPI Kyiv",               "BSc Software Engineering",   "Grammarly", "QA Engineer",              "qa"),
    ("Wendy",    "Okafor",    "wendy.o@gmail.com",            "University of Lagos",    "BSc Computer Science",       "Paystack",  "Test Engineer",            "qa"),
    ("Mikael",   "Lindqvist", "mikael.l@gmail.com",           "Chalmers University",    "MSc Software Engineering",   "Volvo",     "SDET",                     "qa"),
    ("Ana",      "Popescu",   "ana.p@gmail.com",              "Bucharest Polytechnic",  "BSc Computer Science",       "UiPath",    "QA Automation Lead",       "qa"),
    ("Jerome",   "Okafor",    "jerome.o@gmail.com",           "University of Ibadan",   "BSc Computer Science",       "Andela",    "Quality Engineer",         "qa"),
    ("Ingrid",   "Berg",      "ingrid.berg@gmail.com",        "University of Oslo",     "BSc Informatics",            "Kahoot",    "QA Engineer",              "qa"),
]


# ─── Closed job data ──────────────────────────────────────────────────────────

DEVREL_APPLICANTS = [
    ("Priya",    "Kapoor",    "priya.kapoor@gmail.com",   "IIT Bombay",            "BTech Computer Science",   "Twilio",    "Developer Advocate",       "backend"),
    ("Sam",      "Okonkwo",   "sam.okonkwo@gmail.com",    "University of Lagos",   "BSc Computer Science",     "Andela",    "DevRel Engineer",          "fullstack"),
    ("Mia",      "Hofer",     "mia.hofer@gmail.com",      "ETH Zurich",            "MSc Computer Science",     "Stripe",    "Developer Advocate",       "backend"),
    ("Leo",      "Brandt",    "leo.brandt@gmail.com",     "TU Berlin",             "BSc Computer Science",     "Contentful","DevRel Lead",              "fullstack"),
    ("Kezia",    "Mensah",    "kezia.m@gmail.com",        "University of Ghana",   "BSc Information Systems",  "Paystack",  "Developer Experience Eng", "backend"),
    ("Tomás",    "Herrero",   "tomas.h@gmail.com",        "Universidad Autónoma",  "BSc Comp. Engineering",    "Telefónica","API Advocate",             "fullstack"),
    ("Yuna",     "Park",      "yuna.park@gmail.com",      "KAIST",                 "MSc Computer Science",     "Kakao",     "Developer Advocate",       "mobile"),
    ("Eli",      "Shapiro",   "eli.shapiro@gmail.com",    "Hebrew University",     "BSc Software Engineering", "Cloudinary","DevRel Engineer",          "backend"),
]

DATA_ENGINEER_APPLICANTS = [
    ("Arash",    "Tehrani",   "arash.t@gmail.com",        "Sharif University",     "BSc Computer Engineering", "Digikala",  "Data Engineer",            "data"),
    ("Fatou",    "Diallo",    "fatou.d@gmail.com",        "Cheikh Anta Diop",      "BSc Mathematics",          "Orange",    "Analytics Engineer",       "data"),
    ("Viktor",   "Serov",     "viktor.s@gmail.com",       "Moscow State University","MSc Applied Math",         "Yandex",    "Data Platform Engineer",   "data"),
    ("Lena",     "Hoffmann",  "lena.h@gmail.com",         "LMU Munich",            "MSc Statistics",           "Siemens",   "Data Engineer",            "data"),
    ("Diego",    "Fuentes",   "diego.f@gmail.com",        "UNAM Mexico",           "BSc Computer Science",     "Rappi",     "Data Pipeline Engineer",   "data"),
    ("Camille",  "Leroy",     "camille.l@gmail.com",      "Polytechnique Paris",   "MSc Data Science",         "BlaBlaCar", "Analytics Engineer",       "data"),
    ("Jin",      "Wei",       "jin.wei@gmail.com",        "Peking University",     "MSc Computer Science",     "ByteDance", "Data Engineer",            "data"),
    ("Blessing", "Okafor",    "blessing.o@gmail.com",     "University of Ibadan",  "BSc Statistics",           "Flutterwave","Data Analyst",            "data"),
    ("Håkon",    "Berg",      "hakon.b@gmail.com",        "NTNU Trondheim",        "MSc Data Science",         "Equinor",   "Data Platform Engineer",   "data"),
    ("Anika",    "Roy",       "anika.r@gmail.com",        "IIT Delhi",             "BTech Computer Science",   "Meesho",    "Analytics Engineer",       "data"),
]

DEVOPS_APPLICANTS = [
    ("Karim",    "Mansouri",  "karim.m@gmail.com",        "University of Tehran",  "BSc Software Engineering", "Digikala",  "DevOps Engineer",          "devops"),
    ("Saoirse",  "Murphy",    "saoirse.m@gmail.com",      "University College Cork","BSc Computer Science",     "Workday",   "Platform Engineer",        "devops"),
    ("Pavel",    "Horak",     "pavel.h@gmail.com",        "Czech Technical Univ",  "MSc Computer Science",     "JetBrains", "Site Reliability Engineer", "devops"),
    ("Amani",    "Njoroge",   "amani.n@gmail.com",        "University of Nairobi", "BSc Computer Engineering", "Safaricom", "Cloud Engineer",           "devops"),
    ("Mikko",    "Virtanen",  "mikko.v@gmail.com",        "Aalto University",      "MSc Computer Science",     "Nokia",     "DevOps Engineer",          "devops"),
    ("Roxana",   "Ionescu",   "roxana.i@gmail.com",       "Bucharest Polytechnic", "BSc Computer Science",     "UiPath",    "Platform Engineer",        "devops"),
]

CLOSED_SWE_STAGES = [
    ("Applied",   0, False),
    ("Screening", 1, False),
    ("Interview", 2, False),
    ("Hired",     3, True),
    ("Rejected",  4, True),
]

# ─── Main ─────────────────────────────────────────────────────────────────────

def seed() -> None:
    print("Seeding demo data…")
    with Session(engine) as session:
        admin = session.exec(select(User)).first()

        seed_job(
            session,
            title="Senior Software Engineer",
            slug="senior-software-engineer-demo",
            description_md="""## About the role

We're looking for a Senior Software Engineer to join our platform team. You'll design and build the systems that power our core product, mentor junior engineers, and help define our technical direction.

## What you'll do

- Design, build, and maintain scalable backend services
- Lead technical design and code review
- Partner with product and design to ship high-quality features
- Improve observability, reliability, and developer experience

## What we're looking for

- 4+ years of software engineering experience
- Strong fundamentals in distributed systems and databases
- Experience with Python, Go, or similar
""",
            stages_spec=SWE_STAGES,
            form_fields=[
                ("LinkedIn profile", "url", False),
                ("Why do you want to join us?", "textarea", False),
            ],
            applicants_data=SWE_APPLICANTS,
            admin=admin,
        )

        seed_job(
            session,
            title="Product Designer",
            slug="product-designer-demo",
            description_md="""## About the role

We're hiring a Product Designer to shape the visual and interaction language of our product. You'll partner closely with engineering and product to design features used by millions.

## What you'll do

- Own end-to-end design for major product areas
- Conduct user research and usability testing
- Build and maintain our design system
- Collaborate with engineering on pixel-perfect implementation

## What we're looking for

- 3+ years of product design experience
- Strong Figma skills and a portfolio demonstrating impact
- Experience with design systems and accessibility
""",
            stages_spec=DESIGNER_STAGES,
            form_fields=[
                ("Portfolio URL", "url", True),
                ("Design tool of choice", "dropdown", False),
                ("Brief description of your design process", "textarea", False),
            ],
            applicants_data=DESIGNER_APPLICANTS,
            admin=admin,
        )

        seed_job(
            session,
            title="QA Analyst",
            slug="qa-analyst-demo",
            description_md="""## About the role

We're looking for a QA Analyst to help us ship software with confidence. You'll own our test strategy, write automation, and champion quality across the engineering org.

## What you'll do

- Design and implement automated test suites
- Partner with developers to catch issues early
- Build and maintain our CI/CD quality gates
- Report and track bugs through resolution

## What we're looking for

- 2+ years of QA or SDET experience
- Experience with Cypress, Selenium, or similar
- Strong understanding of software testing fundamentals
""",
            stages_spec=QA_STAGES,
            form_fields=[
                ("Years of QA experience", "text", True),
                ("Primary testing framework", "dropdown", True),
            ],
            applicants_data=QA_APPLICANTS,
            admin=admin,
        )

        seed_job(
            session,
            title="Developer Advocate",
            slug="developer-advocate-demo",
            description_md="""## About the role

We hired for this role in Q1. The position is now filled.

## What we looked for

- Technical depth with a love for teaching
- Strong public speaking and writing skills
- Experience building demo apps and tutorials
""",
            stages_spec=CLOSED_SWE_STAGES,
            form_fields=[
                ("Link to a talk or blog post you're proud of", "url", True),
            ],
            applicants_data=DEVREL_APPLICANTS,
            status=JobStatus.closed,
            admin=admin,
        )

        seed_job(
            session,
            title="Data Engineer",
            slug="data-engineer-demo",
            description_md="""## About the role

This position has been filled. Thank you to everyone who applied.

## What we looked for

- Strong SQL and Python skills
- Experience with Spark, dbt, or Airflow
- Comfort with cloud data warehouses (Snowflake, BigQuery)
""",
            stages_spec=CLOSED_SWE_STAGES,
            form_fields=[
                ("Favourite data stack", "text", False),
            ],
            applicants_data=DATA_ENGINEER_APPLICANTS,
            status=JobStatus.closed,
            admin=admin,
        )

        seed_job(
            session,
            title="DevOps / Platform Engineer",
            slug="devops-platform-demo",
            description_md="""## About the role

Hiring for this role is complete. We appreciate your interest.

## What we looked for

- Kubernetes, Terraform, and CI/CD expertise
- Cloud experience (AWS or GCP preferred)
- Strong observability and on-call experience
""",
            stages_spec=CLOSED_SWE_STAGES,
            form_fields=[
                ("Primary cloud provider", "dropdown", False),
            ],
            applicants_data=DEVOPS_APPLICANTS,
            status=JobStatus.closed,
            admin=admin,
        )

    total = len(SWE_APPLICANTS) + len(DESIGNER_APPLICANTS) + len(QA_APPLICANTS) + len(DEVREL_APPLICANTS) + len(DATA_ENGINEER_APPLICANTS) + len(DEVOPS_APPLICANTS)
    print(f"\n✓ Seeded {total} applicants across 6 jobs (3 active, 3 closed)")
    print("\nOpen the demo at:")
    print("  Admin:  http://localhost:3000/admin")
    print("  Portal: http://localhost:3000/careers/senior-software-engineer-demo")


if __name__ == "__main__":
    seed()
