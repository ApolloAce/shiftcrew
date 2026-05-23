import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

# Wait for server to start
import time
time.sleep(5)

# Check employee data types
cmd = """curl -s http://localhost:3000/api/employees | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('Count:', len(data))
if data:
    for k, v in data[0].items():
        print(f'  {k}: {type(v).__name__} = {repr(v)[:60]}')
"
"""
i, o, e = ssh.exec_command(cmd, timeout=20)
print("EMPLOYEES:")
print(o.read().decode(errors='replace').strip())
err = e.read().decode(errors='replace').strip()
if err:
    print("ERR:", err)

# Check leave data
cmd2 = """curl -s http://localhost:3000/api/leave | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('Count:', len(data))
if data:
    for k, v in data[0].items():
        print(f'  {k}: {type(v).__name__} = {repr(v)[:60]}')
"
"""
i, o, e = ssh.exec_command(cmd2, timeout=20)
print("\nLEAVES:")
print(o.read().decode(errors='replace').strip())
err = e.read().decode(errors='replace').strip()
if err:
    print("ERR:", err)

# Check branch data
cmd3 = """curl -s http://localhost:3000/api/branches | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('Count:', len(data))
if data:
    for k, v in data[0].items():
        print(f'  {k}: {type(v).__name__} = {repr(v)[:60]}')
"
"""
i, o, e = ssh.exec_command(cmd3, timeout=20)
print("\nBRANCHES:")
print(o.read().decode(errors='replace').strip())
err = e.read().decode(errors='replace').strip()
if err:
    print("ERR:", err)

ssh.close()
