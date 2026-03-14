"""Fix branchAssignments - convert from object to array format"""
import paramiko
import json

HOST = '104.248.217.57'
USER = 'root'
PASS = '@Emorej02e'

SCHEDULE_ID = '35ec7bb8-027c-45c4-a3da-982164a3af7e'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()

def ssh_exec(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

# Read current branchAssignments
ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT branchAssignments FROM schedules WHERE id = '{SCHEDULE_ID}';\" > /tmp/ba_read.txt")
with sftp.open('/tmp/ba_read.txt', 'r') as f:
    raw = f.read().decode().strip()

print(f"Raw type check: starts with '{raw[:1]}' ({{ = object, [ = array)")

ba = json.loads(raw)
print(f"Parsed type: {type(ba).__name__}")

if isinstance(ba, dict):
    # Convert to array
    ba_array = list(ba.values())
    print(f"Converting dict with {len(ba)} keys to array with {len(ba_array)} items")
    for item in ba_array:
        emps = item.get('employees', [])
        emp_names = [e.get('employeeName', '?') for e in emps]
        print(f"  {item.get('branchName')}: {emp_names}")
    
    ba_json = json.dumps(ba_array)
    ba_hex = ba_json.encode('utf-8').hex()
    sql = f"UPDATE schedules SET branchAssignments = CONVERT(X'{ba_hex}' USING utf8mb4) WHERE id = '{SCHEDULE_ID}';"
    
    with sftp.open('/tmp/fix_ba_array.sql', 'w') as f:
        f.write(sql)
    
    out, err = ssh_exec("mysql -u root shiftcrew < /tmp/fix_ba_array.sql")
    if err:
        print(f"Error: {err}")
    else:
        print("UPDATED to array format")
    
    # Verify
    ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT branchAssignments FROM schedules WHERE id = '{SCHEDULE_ID}';\" > /tmp/ba_verify2.txt")
    with sftp.open('/tmp/ba_verify2.txt', 'r') as f:
        raw2 = f.read().decode().strip()
    ba2 = json.loads(raw2)
    print(f"\nVerification: type={type(ba2).__name__}, length={len(ba2)}")
    print(f"Starts with: {raw2[:1]}")
elif isinstance(ba, list):
    print("Already an array - no fix needed!")

sftp.close()
ssh.close()
print("Done!")
