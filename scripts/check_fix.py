import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

# Check reports page fix
stdin, stdout, stderr = ssh.exec_command('grep "leave.startDate" /var/www/shiftcrew/app/dashboard/reports/page.tsx', timeout=10)
print("Reports leave.startDate lines:")
print(stdout.read().decode(errors='replace'))

# Check dashboard page
stdin, stdout, stderr = ssh.exec_command('grep "leave.startDate" /var/www/shiftcrew/app/dashboard/page.tsx', timeout=10)
print("Dashboard leave.startDate lines:")
print(stdout.read().decode(errors='replace'))

# Check if build output has any clues
stdin, stdout, stderr = ssh.exec_command('tail -30 /tmp/nextbuild.log', timeout=10)
print("Build log tail:")
print(stdout.read().decode(errors='replace'))

ssh.close()
