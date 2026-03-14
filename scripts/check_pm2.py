import paramiko, sys
sys.stdout.reconfigure(line_buffering=True)
print("Connecting...", flush=True)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected", flush=True)

# Check build - use more specific pattern
_, o, _ = ssh.exec_command("pgrep -fa 'next build' | head -3", timeout=10)
procs = o.read().decode(errors='replace').strip()
print(f"Build processes: [{procs}]", flush=True)

# Check if build log indicates completion
_, o, _ = ssh.exec_command("tail -3 /tmp/nextbuild.log", timeout=10)
logTail = o.read().decode(errors='replace').strip()
print(f"Log tail: {logTail}", flush=True)

buildDone = "server-rendered on demand" in logTail or "prerendered as static" in logTail

if buildDone:
    # Check log for errors
    _, o, _ = ssh.exec_command("grep -ci 'error' /tmp/nextbuild.log 2>/dev/null || echo 0", timeout=10)
    errs = o.read().decode(errors='replace').strip()
    print(f"Errors in log: {errs}", flush=True)
    
    # Restart PM2
    _, o, _ = ssh.exec_command("cd /var/www/shiftcrew && pm2 restart shiftcrew 2>&1", timeout=30)
    pm2out = o.read().decode(errors='replace')
    print(f"PM2 restart: {'OK' if 'online' in pm2out else pm2out}", flush=True)
else:
    print("Build not done yet, check log", flush=True)

ssh.close()
print("Done", flush=True)
