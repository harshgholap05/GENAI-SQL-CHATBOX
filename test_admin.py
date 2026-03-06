import requests

# Login
r = requests.post("http://localhost:8000/login", json={
    "email": "harshgholap117@gmail.com",
    "password": "123456"
})
token = r.json()["token"]
print("✅ Token:", token[:30], "...")

# All users
r2 = requests.get("http://localhost:8000/admin/users",
    headers={"Authorization": f"Bearer {token}"}
)
print("Response:", r2.status_code)
print("Data:", r2.json())

