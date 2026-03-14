import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e')

# Check schedule time and shift data
cmd = 'mysql -u root -e "SELECT scheduleFor, time, CAST(branchAssignments AS CHAR) as ba FROM shiftcrew.schedules WHERE scheduleFor = \'2026-02-25\' LIMIT 1\\G"'
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== Today schedule ===")
print(stdout.read().decode())

# Check the schedules table columns  
cmd2 = 'mysql -u root -e "DESCRIBE shiftcrew.schedules;"'
stdin, stdout, stderr = ssh.exec_command(cmd2)
print("=== Schedule columns ===")
print(stdout.read().decode())

ssh.close()
