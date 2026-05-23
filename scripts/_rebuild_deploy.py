import paramiko, time
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

DIR = "/var/www/shiftcrew"

# Step 1: Kill any old build processes
print("Killing old builds...")
i,o,e = ssh.exec_command("pkill -f 'next build' 2>/dev/null; sleep 1; echo DONE", timeout=15)
print(o.read().decode().strip())

# Step 2: Delete old .next cache
print("Deleting old .next...")
i,o,e = ssh.exec_command(f"rm -rf {DIR}/.next && echo DELETED", timeout=30)
print(o.read().decode().strip())

# Step 3: Ensure node_modules are up to date
print("Running npm install...")
i,o,e = ssh.exec_command(f"cd {DIR} && npm install --legacy-peer-deps 2>&1 | tail -5", timeout=120)
print(o.read().decode(errors='replace').strip())
print(e.read().decode(errors='replace').strip())

# Step 4: Start fresh build
print("Starting fresh build...")
i,o,e = ssh.exec_command(
    f"cd {DIR} && nohup npx next build > /tmp/nextbuild.log 2>&1 & echo $!",
    timeout=30
)
pid = o.read().decode().strip()
print(f"Build PID: {pid}")

# Step 5: Wait and check
print("Waiting for build to complete...")
for attempt in range(60):
    time.sleep(5)
    i,o,e = ssh.exec_command("pgrep -f 'next build' || echo DONE", timeout=10)
    status = o.read().decode().strip()
    if status == "DONE":
        print(f"Build finished after ~{(attempt+1)*5}s")
        break
    else:
        i,o,e = ssh.exec_command("tail -3 /tmp/nextbuild.log", timeout=10)
        log = o.read().decode(errors='replace').strip()
        print(f"  [{(attempt+1)*5}s] Still building... {log[-60:]}")
else:
    print("Build took too long!")
    ssh.close()
    exit(1)

# Step 6: Check for errors
i,o,e = ssh.exec_command("grep -i 'error\\|failed' /tmp/nextbuild.log | head -5", timeout=10)
errors = o.read().decode(errors='replace').strip()
if errors:
    print(f"BUILD ERRORS: {errors}")
    i,o,e = ssh.exec_command("tail -30 /tmp/nextbuild.log", timeout=10)
    print(o.read().decode(errors='replace'))
    ssh.close()
    exit(1)

# Step 7: Show build result
i,o,e = ssh.exec_command("tail -20 /tmp/nextbuild.log", timeout=10)
print(o.read().decode(errors='replace').strip())

# Step 8: Restart PM2
print("\nRestarting PM2...")
i,o,e = ssh.exec_command(f"cd {DIR} && pm2 restart shiftcrew 2>&1", timeout=30)
print(o.read().decode(errors='replace').strip())

print("\nDEPLOYED SUCCESSFULLY!")
ssh.close()
