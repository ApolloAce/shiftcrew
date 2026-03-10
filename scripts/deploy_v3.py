import paramiko, tarfile, os, io, time, sys
sys.stdout.reconfigure(line_buffering=True)

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"
REMOTE_DIR = "/var/www/shiftcrew"

files = [
    "app/dashboard/scheduling/page.tsx",
    "app/employee/attendance/page.tsx",
    "app/employee/page.tsx",
    "app/employee/schedule/page.tsx",
    "app/employee/notifications/page.tsx",
    "app/api/attendance/validate-location/route.ts",
    "app/api/cron/rotate/route.ts",
    "app/api/cron/post-leave/route.ts",
    "lib/utils.ts",
    "app/layout.tsx",
    "app/page.tsx",
    "app/dashboard/layout.tsx",
    "app/employee/layout.tsx",
]

step = sys.argv[1] if len(sys.argv) > 1 else "upload"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

if step == "upload":
    # Upload files
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
    print("Uploaded")
    
    # Extract
    stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_DIR} && tar xzf deploy_fix.tar.gz && rm deploy_fix.tar.gz && echo OK", timeout=30)
    print("Extract:", stdout.read().decode().strip())
    
    # Verify changes
    stdin, stdout, stderr = ssh.exec_command(f"grep -c 'weekAttendance' {REMOTE_DIR}/app/dashboard/scheduling/page.tsx", timeout=10)
    print(f"weekAttendance in scheduling: {stdout.read().decode().strip()} matches")
    stdin, stdout, stderr = ssh.exec_command(f"grep -c 'rotation-aware' {REMOTE_DIR}/app/employee/page.tsx", timeout=10)
    print(f"rotation-aware in employee page: {stdout.read().decode().strip()} matches")
    stdin, stdout, stderr = ssh.exec_command(f"grep -c 'schedule branch' {REMOTE_DIR}/app/employee/attendance/page.tsx", timeout=10)
    print(f"schedule branch in attendance: {stdout.read().decode().strip()} matches")
    
    # Start build in background
    stdin, stdout, stderr = ssh.exec_command(
        f"cd {REMOTE_DIR} && nohup npx next build > /tmp/nextbuild.log 2>&1 & echo $!",
        timeout=30
    )
    pid = stdout.read().decode().strip()
    print(f"Build started in background, PID: {pid}")
    print("Run: python scripts/deploy_v3.py check")

elif step == "check":
    # Check if build is still running
    stdin, stdout, stderr = ssh.exec_command("pgrep -f 'next build' || echo 'NOT_RUNNING'", timeout=10)
    status = stdout.read().decode().strip()
    if status == "NOT_RUNNING":
        print("Build finished!")
        # Show build log
        stdin, stdout, stderr = ssh.exec_command("tail -20 /tmp/nextbuild.log", timeout=10)
        print(stdout.read().decode(errors='replace'))
        
        # Check for errors
        stdin, stdout, stderr = ssh.exec_command("grep -i 'error\\|failed' /tmp/nextbuild.log | head -5", timeout=10)
        errors = stdout.read().decode(errors='replace').strip()
        if errors:
            print("ERRORS FOUND:", errors)
        else:
            print("No errors!")
            # Restart PM2
            stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_DIR} && pm2 restart shiftcrew 2>&1", timeout=30)
            print(stdout.read().decode(errors='replace'))
            print("DEPLOYED SUCCESSFULLY!")
    else:
        print(f"Build still running (PID: {status})")
        stdin, stdout, stderr = ssh.exec_command("tail -5 /tmp/nextbuild.log", timeout=10)
        print(stdout.read().decode(errors='replace'))
        print("Run again: python scripts/deploy_v3.py check")

ssh.close()
