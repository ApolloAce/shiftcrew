import paramiko, sys, time
sys.stdout.reconfigure(line_buffering=True)

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

action = sys.argv[1] if len(sys.argv) > 1 else "all"

if action in ("migrate", "all"):
    print("=== Running DB Migration ===")
    # Upload migration SQL
    migration_sql = open(r"c:\client\shiftcrew\scripts\migrate-rotation-v2.sql", "r").read()
    _, o, e = c.exec_command(f'mysql -u root shiftcrew -e "{migration_sql}" 2>&1', timeout=30)
    # Use heredoc approach instead
    sftp = c.open_sftp()
    with sftp.file("/tmp/migrate-rotation-v2.sql", "w") as f:
        f.write(migration_sql)
    sftp.close()

    _, o, e = c.exec_command("mysql -u root shiftcrew < /tmp/migrate-rotation-v2.sql 2>&1", timeout=30)
    out = o.read().decode('utf-8', errors='replace').strip()
    err = e.read().decode('utf-8', errors='replace').strip()
    print(f"  Output: {out}")
    if err:
        print(f"  Stderr: {err}")

    # Verify tables exist
    _, o, _ = c.exec_command("mysql -u root shiftcrew -e 'SHOW TABLES' 2>&1", timeout=10)
    print(f"\n  Tables: {o.read().decode().strip()}")

    # Verify new columns
    _, o, _ = c.exec_command("mysql -u root shiftcrew -e 'DESCRIBE employee_branch_history' 2>&1", timeout=10)
    print(f"\n  employee_branch_history:\n{o.read().decode().strip()}")

    _, o, _ = c.exec_command("mysql -u root shiftcrew -e 'DESCRIBE rotation_log' 2>&1", timeout=10)
    print(f"\n  rotation_log:\n{o.read().decode().strip()}")

    _, o, _ = c.exec_command("mysql -u root shiftcrew -e \"SHOW COLUMNS FROM branches LIKE 'maxCapacity'\" 2>&1", timeout=10)
    print(f"\n  branches.maxCapacity:\n{o.read().decode().strip()}")

if action in ("deploy", "all"):
    print("\n=== Deploying Updated Files ===")
    import tarfile, os, io

    files = [
        "app/api/cron/rotate/route.ts",
    ]

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        base = r"c:\client\shiftcrew"
        for f in files:
            full = os.path.join(base, f.replace("/", os.sep))
            tar.add(full, arcname=f)
    buf.seek(0)

    sftp = c.open_sftp()
    sftp.putfo(buf, "/var/www/shiftcrew/deploy_fix.tar.gz")
    sftp.close()
    print("  Uploaded tar")

    _, o, _ = c.exec_command("cd /var/www/shiftcrew && tar xzf deploy_fix.tar.gz && rm deploy_fix.tar.gz && echo OK", timeout=30)
    print(f"  Extract: {o.read().decode().strip()}")

    # Verify file
    _, o, _ = c.exec_command("grep -c 'generateFairRotation' /var/www/shiftcrew/app/api/cron/rotate/route.ts", timeout=10)
    print(f"  generateFairRotation in route: {o.read().decode().strip()} matches")

    _, o, _ = c.exec_command("grep -c 'employee_branch_history' /var/www/shiftcrew/app/api/cron/rotate/route.ts", timeout=10)
    print(f"  employee_branch_history in route: {o.read().decode().strip()} matches")

if action in ("build", "all"):
    print("\n=== Starting Build ===")
    c.exec_command('pkill -9 -f "next build" 2>/dev/null')
    time.sleep(2)
    _, o, _ = c.exec_command(
        'cd /var/www/shiftcrew && nohup bash -c "npm run build > /tmp/nextbuild.log 2>&1 && pm2 restart shiftcrew >> /tmp/nextbuild.log 2>&1 && echo BUILD_AND_RESTART_DONE >> /tmp/nextbuild.log" &',
        timeout=10
    )
    time.sleep(1)
    print("  Build started in background")
    print("  Run: python scripts/deploy_rotation_v2.py check")

if action == "check":
    _, o, _ = c.exec_command('pgrep -f "next build" || echo NOPROCESS', timeout=10)
    status = o.read().decode().strip()
    if status == "NOPROCESS":
        _, o, _ = c.exec_command('grep "BUILD_AND_RESTART_DONE" /tmp/nextbuild.log 2>/dev/null && echo YES || echo NO', timeout=10)
        done = o.read().decode().strip()
        if "YES" in done:
            print("BUILD COMPLETE + PM2 RESTARTED!")
            _, o, _ = c.exec_command('tail -30 /tmp/nextbuild.log', timeout=10)
            print(o.read().decode('utf-8', errors='replace'))
        else:
            print("Build not running but not completed. Log:")
            _, o, _ = c.exec_command('tail -20 /tmp/nextbuild.log', timeout=10)
            print(o.read().decode('utf-8', errors='replace'))
    else:
        print(f"Build still running (PID: {status})")
        _, o, _ = c.exec_command('tail -5 /tmp/nextbuild.log', timeout=10)
        print(o.read().decode('utf-8', errors='replace'))

c.close()
