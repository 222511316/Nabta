def test_health_reports_ok(anon):
    response = anon.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
