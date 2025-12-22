import prisma from './lib/prisma.js';
import bcrypt from 'bcryptjs';

async function seedGroups() {
  try {
    console.log('🌱 Seeding school groups...');

    // Check if groups already exist
    const existingGroups = await prisma.schoolGroup.findMany();
    
    if (existingGroups.length > 0) {
      console.log('✅ Groups already exist:', existingGroups.length);
      
      // Display existing groups
      for (const group of existingGroups) {
        console.log(`\n📍 Group: ${group.groupName}`);
        console.log(`   ID: ${group.id}`);
        console.log(`   Status: ${group.status}`);
        
        // Check for admins
        const admins = await prisma.groupAdmin.findMany({
          where: { groupId: group.id }
        });
        
        console.log(`   Admins: ${admins.length}`);
        if (admins.length > 0) {
          admins.forEach(admin => {
            console.log(`   - ${admin.email} (${admin.name})`);
          });
        }
      }
      
      return existingGroups;
    }

    // Create default school group
    console.log('\n📝 Creating default school group...');
    
    const group = await prisma.schoolGroup.create({
      data: {
        groupName: 'Default School Group',
        displayName: 'Default Group',
        subdomain: 'default',
        dbName: 'default_schools',
        dbHost: 'postgres_schools',
        dbUser: 'school_admin',
        dbPassword: 'school123',
        status: 'Active'
      }
    });

    console.log('✅ Group created:', group.groupName, '(ID:', group.id + ')');

    // Create admin for this group
    console.log('\n📝 Creating group admin...');
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const admin = await prisma.groupAdmin.create({
      data: {
        email: 'rakesh@gmail.com',
        password: hashedPassword,
        name: 'Rakesh Kumar',
        role: 'admin',
        groupId: group.id,
        isActive: true
      }
    });

    console.log('✅ Admin created:', admin.email);
    
    console.log('\n✨ Seeding complete!');
    console.log('\n📌 You can now login with:');
    console.log('   Email: rakesh@gmail.com');
    console.log('   Password: admin123');
    console.log('   Group ID:', group.id);
    
    return [group];

  } catch (error) {
    console.error('❌ Seed error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedGroups()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

