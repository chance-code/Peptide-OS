import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import AppleProvider from 'next-auth/providers/apple'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'

// User configurations with their password hashes and profile names
interface UserConfig {
  name: string
  hashEnvVar: string
}

const users: UserConfig[] = [
  { name: 'Chance Olson', hashEnvVar: 'AUTH_PASSWORD_HASH' },
  { name: 'Angela Olson', hashEnvVar: 'AUTH_PASSWORD_HASH_ANGELA' },
]

// Map OAuth emails to existing profile names
const emailToProfileName: Record<string, string> = {
  'chanceolson@gmail.com': 'Chance Olson',
  'angelaolson8@gmail.com': 'Angela Olson',
}

/**
 * Resolve or create a UserProfile for the given name.
 * Called once per JWT lifecycle (initial sign-in) to embed profileId in the token.
 */
async function resolveProfileId(profileName: string): Promise<string> {
  const existing = await prisma.userProfile.findFirst({
    where: { name: profileName },
    select: { id: true },
  })
  if (existing) return existing.id

  const created = await prisma.userProfile.create({
    data: { name: profileName, isActive: true },
    select: { id: true },
  })
  return created.id
}

export const authOptions: NextAuthOptions = {
  providers: [
    // Google OAuth
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    // Apple Sign-In
    ...(process.env.APPLE_ID && process.env.APPLE_SECRET
      ? [
          AppleProvider({
            clientId: process.env.APPLE_ID,
            clientSecret: process.env.APPLE_SECRET,
          }),
        ]
      : []),

    // Password-based auth
    CredentialsProvider({
      name: 'Password',
      credentials: {
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        console.log('Login attempt...')

        if (!credentials?.password) {
          console.log('No password provided')
          return null
        }

        // Try each user's password
        for (const userConfig of users) {
          const encodedHash = process.env[userConfig.hashEnvVar]
          if (!encodedHash) continue

          const passwordHash = Buffer.from(encodedHash, 'base64').toString('utf-8')
          const isValid = await bcrypt.compare(credentials.password, passwordHash)

          if (isValid) {
            console.log(`Login successful for ${userConfig.name}`)
            return {
              id: userConfig.name,
              name: userConfig.name,
            }
          }
        }

        console.log('No matching password found')
        return null
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn() {
      return true
    },

    async jwt({ token, user, account }) {
      // On initial sign-in, resolve profileName and profileId once
      if (user) {
        token.email = user.email
        token.provider = account?.provider || 'credentials'

        // Map OAuth emails to existing profile names
        const profileName =
          user.email && emailToProfileName[user.email.toLowerCase()]
            ? emailToProfileName[user.email.toLowerCase()]
            : (user.name ?? user.email ?? 'Unknown')

        token.profileName = profileName
        token.name = profileName

        // Resolve the DB profileId and embed it in the token
        try {
          token.profileId = await resolveProfileId(profileName)
        } catch (err) {
          console.error('[auth] Failed to resolve profileId:', err)
        }
      }

      // Backfill profileId for existing sessions that don't have it yet
      if (!token.profileId && token.name) {
        try {
          token.profileId = await resolveProfileId(token.name)
        } catch (err) {
          console.error('[auth] Failed to backfill profileId:', err)
        }
      }

      return token
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.profileId as string | undefined
        session.user.name = (token.profileName ?? token.name) as string | undefined
        session.user.provider = token.provider as string | undefined
      }
      return session
    },
  },
}
