import requests

# Assuming local user KIM exists, we can try to call the endpoint.
res = requests.post("http://127.0.0.1:8000/api/onboarding/words/mark-decision", json={
    "user_id": "KIM",
    "word_id": 1,
    "study_phase": 1,
    "to_be_tested": True
})
print(res.status_code)
print(res.text)
