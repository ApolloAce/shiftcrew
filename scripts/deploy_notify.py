import paramiko, tarfile, os, io, time, sys

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"
REMOTE_DIR = "/var/www/shiftcrew"

files = [
    "app/dashboard/scheduling/page.tsx",
    "app/employee/notifications/page.tsx",
]

step = sys.argv[1] if len(sys.argv) > 1 else "upload"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

if step == "upload":
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        base = r"c:\client\shiftcrew"
        for f in files:
            full = os.path.join(base, f.replace("/", os.sep))
            tar.add(full, arcname=f)
    buf.seek(0)
    
    sftp = ssh.open_sftp()
    sftp.putfo(buf, f"{REMOTE_DIR}/deploy_fix.tar.gz")
    sftp.close()
    print("[1] Uploaded")
    
    i, o, e = ssh.exec_command(f"cd {REMOTE_DIR} && tar xzf deploy_fix.tar.gz && rm deploy_fix.tar.gz && echo OK", timeout=30)
    print("[2] Extract:", o.read().decode().strip())
    
    # Verify
    i, o, e = ssh.exec_command(f"grep -c 'sendScheduleNotifications' {REMOTE_DIR}/app/dashboard/scheduling/page.tsx", timeout=10)
    print("[3] scheduling has sendScheduleNotifications:", o.read().decode().strip(), "matches")
    i, o, e = ssh.exec_command(f"grep -c 'shiftTimes' {REMOTE_DIR}/app/employee/notifications/page.tsx", timeout=10)
    print("[3] notifications has shiftTimes:", o.read().decode().strip(), "matches")
    
    # Start build in background
    i, o, e = ssh.exec_command(f"cd {REMOTE_DIR} && nohup npx next build > /tmp/nextbuild.log 2>&1 & echo $!", timeout=10)
    pid = o.read().decode().strip()
    print(f"[4] Build started (PID: {pid})")
    print("Run: python scripts/deploy_notify.py check")

elif step == "check":
    i, o, e = ssh.exec_command("pgrep -f 'next build' || echo 'DONE'", timeout=10)
    status = o.read().decode().strip()
    if status == "DONE":
        print("Build finished!")
        i, o, e = ssh.exec_command("tail -15 /tmp/nextbuild.log", timeout=10)
        print(o.read().decode())
        
        i, o, e = ssh.exec_command("grep -iE 'error|failed' /tmp/nextbuild.log | grep -v 'Warning' | head -5", timeout=10)
        errors = o.read().decode().strip()
        if errors and 'Error' in errors:
            print("ERRORS:", errors)
        else:
            print("No errors. Restarting PM2...")
            i, o, e = ssh.exec_command(f"cd {REMOTE_DIR} && pm2 restart shiftcrew 2>&1", timeout=30)
            print(o.read().decode())
            print("DEPLOYED!")
    else:
        print(f"Build still running (PID: {status})")
        i, o, e = ssh.exec_command("tail -5 /tmp/nextbuild.log", timeout=10)
        print(o.read().decode())

ssh.close()
