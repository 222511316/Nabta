"""Small helpers shared by the test modules."""

from tests.images import jpeg

PASSWORD = "correct-horse-42"


def register(client, *, email="sara@example.com", full_name="Sara Ahmed", password=PASSWORD, role=None):
    payload = {"full_name": full_name, "email": email, "password": password}
    if role is not None:
        payload["role"] = role
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def login(client, *, email="sara@example.com", password=PASSWORD):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def add_plant(client, name="Lemon tree", **fields):
    response = client.post("/api/plants", json={"name": name, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def upload(
    client,
    plant_id,
    photo=None,
    *,
    filename="bug.jpg",
    content_type="image/jpeg",
    observed_on="2026-09-20",
    notes=None,
    client_request_id=None,
):
    """POSTs a multipart observation; `photo` defaults to a valid 800×600 JPEG."""
    if photo is None:
        photo = jpeg()
    data = {"observed_on": observed_on}
    if notes is not None:
        data["notes"] = notes
    if client_request_id is not None:
        data["client_request_id"] = client_request_id
    return client.post(
        f"/api/plants/{plant_id}/observations",
        data=data,
        files={"photo": (filename, photo, content_type)},
    )


def add_observation(client, plant_id, **kwargs):
    response = upload(client, plant_id, **kwargs)
    assert response.status_code == 201, response.text
    return response.json()


def assert_error(response, status, code, fields=None):
    """Assert the uniform error envelope and return its body."""
    assert response.status_code == status, response.text
    body = response.json()
    assert body["code"] == code
    assert isinstance(body["message"], str) and body["message"]
    if fields is None:
        assert "fields" not in body
    else:
        assert body["fields"] == fields
    return body
