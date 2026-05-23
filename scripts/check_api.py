import paramiko, json
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

stdin, stdout, stderr = ssh.exec_command('curl -s http://localhost:3000/api/leave?status=approved', timeout=15)
raw = stdout.read().decode(errors='replace')
try:
    data = json.loads(raw)
    if isinstance(data, list) and len(data) > 0:
        print(f"Got {len(data)} leave records")
        print(f"First record keys: {list(data[0].keys())}")
        for k, v in data[0].items():
            print(f"  {k}: type={type(v).__name__}, value={repr(v)[:100]}")
    elif isinstance(data, dict):
        print(f"Got dict response: {data}")
    else:
        print(f"Got: {type(data)}, {repr(data)[:200]}")
except json.JSONDecodeError as e:
    print(f"JSON decode error: {e}")
    print(f"Raw: {raw[:500]}")

ssh.close()
