import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { Report } from '../models/Report.js';
import { logger } from '../utils/logger.js';

async function seed() {
  try {
    logger.info('Connecting to MongoDB for seeding...');
    await mongoose.connect(env.MONGODB_URI);
    logger.info('Connected to MongoDB.');

    // 1. Create or update Superadmin
    let admin = await User.findOne({ email: 'admin@connectly.app' });
    if (!admin) {
      const hashedPassword = await bcrypt.hash('Admin123!', 12);
      admin = await User.create({
        name: 'Connectly Administrator',
        username: 'admin',
        email: 'admin@connectly.app',
        password: hashedPassword,
        role: 'superadmin',
        status: 'active',
        isEmailVerified: true,
        bio: 'Platform super administrator and moderator.',
      });
      logger.info('Created superadmin: admin@connectly.app / Admin123!');
    } else {
      logger.info('Superadmin already exists.');
    }

    // 2. Create demo user Alice
    let alice = await User.findOne({ email: 'alice@connectly.app' });
    if (!alice) {
      const hashedPassword = await bcrypt.hash('Password123!', 12);
      alice = await User.create({
        name: 'Alice Cooper',
        username: 'alice',
        email: 'alice@connectly.app',
        password: hashedPassword,
        role: 'user',
        status: 'active',
        isEmailVerified: true,
        bio: 'Product Designer at Connectly.',
      });
      logger.info('Created user: alice@connectly.app / Password123!');
    }

    // 3. Create demo user Bob
    let bob = await User.findOne({ email: 'bob@connectly.app' });
    if (!bob) {
      const hashedPassword = await bcrypt.hash('Password123!', 12);
      bob = await User.create({
        name: 'Bob Ross',
        username: 'bob',
        email: 'bob@connectly.app',
        password: hashedPassword,
        role: 'user',
        status: 'active',
        isEmailVerified: true,
        bio: 'Frontend enthusiast and creative developer.',
      });
      logger.info('Created user: bob@connectly.app / Password123!');
    }

    // 4. Create sample 1-to-1 conversation between Alice and Bob
    const pairKey = [alice._id.toString(), bob._id.toString()].sort().join('_');
    let privateConv = await Conversation.findOne({ privateUserPairKey: pairKey });
    if (!privateConv) {
      privateConv = await Conversation.create({
        type: 'private',
        privateUserPairKey: pairKey,
        createdBy: alice._id,
        participants: [
          { user: alice._id, role: 'member', joinedAt: new Date() },
          { user: bob._id, role: 'member', joinedAt: new Date() },
        ],
      });
      logger.info('Created sample direct conversation between Alice and Bob.');
    }

    // 5. Seed sample messages
    const existingMsg = await Message.findOne({ conversation: privateConv._id });
    if (!existingMsg) {
      const msg1 = await Message.create({
        conversation: privateConv._id,
        sender: alice._id,
        clientMessageId: 'seed-msg-1',
        content: 'Hey Bob! Welcome to Connectly!',
        type: 'text',
      });

      await Message.create({
        conversation: privateConv._id,
        sender: bob._id,
        clientMessageId: 'seed-msg-2',
        content: 'Hi Alice! Excited to test the real-time messaging system.',
        type: 'text',
        replyTo: msg1._id,
      });

      privateConv.lastMessage = {
        messageId: msg1._id,
        content: 'Hi Alice! Excited to test the real-time messaging system.',
        sender: bob._id,
        type: 'text',
        createdAt: new Date(),
      };
      await privateConv.save();
      logger.info('Seeded sample conversation messages.');
    }

    // 6. Create sample notification
    const existingNotif = await Notification.findOne({ recipient: bob._id });
    if (!existingNotif) {
      await Notification.create({
        recipient: bob._id,
        actor: alice._id,
        type: 'message',
        conversation: privateConv._id,
        title: 'Alice Cooper',
        body: 'Hey Bob! Welcome to Connectly!',
      });
      logger.info('Created sample notification for Bob.');
    }

    // 7. Create sample moderation report for admin queue
    const existingReport = await Report.findOne({ reporter: bob._id });
    if (!existingReport) {
      await Report.create({
        reporter: bob._id,
        reportedUser: alice._id,
        reason: 'other',
        description: 'Testing moderation queue functionality from seed script.',
        status: 'pending',
      });
      logger.info('Created sample pending report for moderation queue.');
    }

    logger.info('Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Error during database seeding:', error);
    process.exit(1);
  }
}

seed();

