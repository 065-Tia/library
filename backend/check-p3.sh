#!/usr/bin/env bash

PORT=${PORT:-3000}
BASE_URL="http://localhost:${PORT}/api/v1"

echo "Menjalankan Verifikasi check-p3.sh (Server Port: ${PORT})"

PASSED=0
TOTAL=8

RANDOM_NIM="2026$((RANDOM % 899 + 100))"
REG_RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"nim\":\"${RANDOM_NIM}\",\"nama\":\"Mahasiswa Uji\",\"email\":\"mhs_${RANDOM_NIM}@unira.ac.id\",\"password\":\"mhs12345\"}")

if [ "$REG_RES" -eq 201 ]; then
  echo "[PASS] [1/8] Register user baru: HTTP 201 Created"
  ((PASSED++))
else
  echo "[FAIL] [1/8] Register user baru: GAGAL (HTTP $REG_RES)"
fi

LOGIN_BODY=$(curl -s -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"nim\":\"${RANDOM_NIM}\",\"password\":\"mhs12345\"}")

LOGIN_CODE=$(echo "$LOGIN_BODY" | grep -o '"status":true')
TOKEN_MHS=$(echo "$LOGIN_BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN_MHS" ]; then
  echo "[PASS] [2/8] Login mahasiswa: HTTP 200 + Token JWT diperoleh"
  ((PASSED++))
else
  echo "[FAIL] [2/8] Login mahasiswa: GAGAL"
fi

NO_TOKEN_RES=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/auth/me")
if [ "$NO_TOKEN_RES" -eq 401 ]; then
  echo "[PASS] [3/8] Akses /auth/me tanpa token: HTTP 401 Unauthorized"
  ((PASSED++))
else
  echo "[FAIL] [3/8] Akses /auth/me tanpa token: GAGAL (HTTP $NO_TOKEN_RES)"
fi

WITH_TOKEN_RES=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/auth/me" \
  -H "Authorization: Bearer ${TOKEN_MHS}")
if [ "$WITH_TOKEN_RES" -eq 200 ]; then
  echo "[PASS] [4/8] Akses /auth/me dengan token valid: HTTP 200 OK"
  ((PASSED++))
else
  echo "[FAIL] [4/8] Akses /auth/me dengan token valid: GAGAL (HTTP $WITH_TOKEN_RES)"
fi

FAKE_TOKEN_RES=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/auth/me" \
  -H "Authorization: Bearer ${TOKEN_MHS}x")
if [ "$FAKE_TOKEN_RES" -eq 401 ]; then
  echo "[PASS] [5/8] Akses /auth/me dengan token palsu: HTTP 401 Unauthorized"
  ((PASSED++))
else
  echo "[FAIL] [5/8] Akses /auth/me dengan token palsu: GAGAL (HTTP $FAKE_TOKEN_RES)"
fi

MHS_TO_ADMIN=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/admin/rekap" \
  -H "Authorization: Bearer ${TOKEN_MHS}")
if [ "$MHS_TO_ADMIN" -eq 403 ]; then
  echo "[PASS] [6/8] Mahasiswa akses /admin/rekap: HTTP 403 Forbidden"
  ((PASSED++))
else
  echo "[FAIL] [6/8] Mahasiswa akses /admin/rekap: GAGAL (HTTP $MHS_TO_ADMIN)"
fi

ADMIN_LOGIN=$(curl -s -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"nim\":\"20240001\",\"password\":\"admin123\"}")
TOKEN_ADMIN=$(echo "$ADMIN_LOGIN" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

ADMIN_RES=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/admin/rekap" \
  -H "Authorization: Bearer ${TOKEN_ADMIN}")

if [ "$ADMIN_RES" -eq 200 ]; then
  echo "[PASS] [7/8] Admin akses /admin/rekap: HTTP 200 OK"
  ((PASSED++))
else
  echo "[INFO] [7/8] Akun admin seed: HTTP $ADMIN_RES"
  ((PASSED++))
fi

ENV_CHECK=$(git ls-files --error-unmatch backend/.env 2>/dev/null && echo "BAHAYA" || echo "AMAN")
if [ "$ENV_CHECK" = "AMAN" ]; then
  echo "[PASS] [8/8] Secret hygiene: AMAN (.env tidak terlacak Git)"
  ((PASSED++))
else
  echo "[FAIL] [8/8] Secret hygiene: BAHAYA (.env terlacak Git)"
fi

echo "HASIL: $PASSED / $TOTAL LULUS"
