import paramiko, time, sys
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...", flush=True)
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)
print("Connected!", flush=True)

DIR = "/var/www/shiftcrew"

def run(cmd, t=30):
    i,o,e = ssh.exec_command(cmd, timeout=t)
    return o.read().decode(errors='replace').strip()

# Kill old builds
print("1. Killing old builds...", flush=True)
print(run("pkill -f 'next build' 2>/dev/null; sleep 1; echo OK"), flush=True)

# Delete .next cache  
print("2. Deleting .next cache...", flush=True)
print(run(f"rm -rf {DIR}/.next && echo DELETED"), flush=True)

# Start build
print("3. Starting build (in background)...", flush=True)
print(run(f"cd {DIR} && nohup npx next build > /tmp/nextbuild.log 2>&1 & echo PID:$!"), flush=True)

# Poll for completion
print("4. Waiting for build...", flush=True)
for i in range(120):
    time.sleep(5)
    status = run("pgrep -f 'next build' || echo DONE")
    if status == "DONE":
        print(f"   Build completed! (~{(i+1)*5}s)", flush=True)
        break
    log_tail = run("tail -1 /tmp/nextbuild.log")
    if (i+1) % 6 == 0:
        print(f"   [{(i+1)*5}s] {log_tail[-80:]}", flush=True)
else:
    print("BUILD TIMEOUT!", flush=True)

# Check errors
print("5. Checking for errors...", flush=True)
errors = run("grep -i 'error\\|failed' /tmp/nextbuild.log | head -3")
if errors:
    print(f"ERRORS: {errors}", flush=True)
    print(run("tail -20 /tmp/nextbuild.log"), flush=True)
else:
    print("No errors!", flush=True)
    print(run("tail -15 /tmp/nextbuild.log"), flush=True)
    
    # Restart PM2
    print("\n6. Restarting PM2...", flush=True)
    print(run(f"cd {DIR} && pm2 restart shiftcrew 2>&1"), flush=True)
    print("\nDEPLOYED!", flush=True)

ssh.close()
