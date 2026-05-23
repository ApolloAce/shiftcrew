"""Deploy dashboard date-navigation timezone fix.

Fixes:
  - Previous/Next arrow buttons on admin dashboard attendance table were
    skipping by 2 days (e.g. May 23 -> May 21) due to UTC vs local-time mismatch
    when using `toISOString().split('T')[0]`.
  - Status not displayed for previous days was a symptom: the wrong day was
    loaded, landing on a day with no attendance data.

All UTC-based date conversions in app/dashboard/page.tsx replaced with the
existing `toLocalDateISO()` helper from lib/utils.ts.
"""
import paramiko, tarfile, os, io, sys
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"
REMOTE_DIR = "/var/www/shiftcrew"

files = [
    "app/dashboard/page.tsx",
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
    print("Uploaded")

    stdin, stdout, stderr = ssh.exec_command(
        f"cd {REMOTE_DIR} && tar xzf deploy_fix.tar.gz && rm deploy_fix.tar.gz && echo OK",
        timeout=30,
    )
    print("Extract:", stdout.read().decode().strip())

    # Verify the fix landed: no UTC toISOString().split('T')[0] left in file,
    # and the toLocalDateISO helper is now used in the navigation handlers.
    stdin, stdout, stderr = ssh.exec_command(
        f"grep -c \"toISOString().split\" {REMOTE_DIR}/app/dashboard/page.tsx || echo 0",
        timeout=10,
    )
    print(f"toISOString().split occurrences (should be 0): {stdout.read().decode().strip()}")

    stdin, stdout, stderr = ssh.exec_command(
        f"grep -c 'toLocalDateISO' {REMOTE_DIR}/app/dashboard/page.tsx",
        timeout=10,
    )
    print(f"toLocalDateISO occurrences (should be >= 10): {stdout.read().decode().strip()}")

    # Start build in background
    stdin, stdout, stderr = ssh.exec_command(
        f"cd {REMOTE_DIR} && nohup npx next build > /tmp/nextbuild.log 2>&1 & echo $!",
        timeout=30,
    )
    pid = stdout.read().decode().strip()
    print(f"Build started in background, PID: {pid}")
    print("Run: python scripts/deploy_dashboard_date_fix.py check")

elif step == "check":
    stdin, stdout, stderr = ssh.exec_command(
        "pgrep -f '[n]ext build' || echo 'NOT_RUNNING'", timeout=10
    )
    status = stdout.read().decode().strip()
    if status == "NOT_RUNNING":
        print("Build finished!")
        stdin, stdout, stderr = ssh.exec_command("tail -30 /tmp/nextbuild.log", timeout=10)
        print(stdout.read().decode(errors="replace"))

        stdin, stdout, stderr = ssh.exec_command(
            "grep -iE 'error|failed' /tmp/nextbuild.log | grep -v 'errors.inc' | head -10",
            timeout=10,
        )
        errors = stdout.read().decode(errors="replace").strip()
        if errors:
            print("ERRORS FOUND:", errors)
        else:
            print("No errors!")
            stdin, stdout, stderr = ssh.exec_command(
                f"cd {REMOTE_DIR} && pm2 restart shiftcrew 2>&1", timeout=30
            )
            print(stdout.read().decode(errors="replace"))
            print("DEPLOYED SUCCESSFULLY!")
    else:
        print(f"Build still running (PID: {status})")
        stdin, stdout, stderr = ssh.exec_command("tail -5 /tmp/nextbuild.log", timeout=10)
        print(stdout.read().decode(errors="replace"))
        print("Run again: python scripts/deploy_dashboard_date_fix.py check")

ssh.close()
