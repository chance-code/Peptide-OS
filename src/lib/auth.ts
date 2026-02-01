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

            // Don't modify database isActive flag here - each browser session
            // manages its own current profile via localStorage independently.
            // This allows multiple users to be logged in simultaneously on
            // different devices without affecting each other.

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
    async signIn({ user, account }) {
      // For OAuth providers, handle user creation/linking
      if (account?.provider === 'google' || account?.provider === 'apple') {
        try {
          const email = user.email
          const name = user.name || 'User'

          if (!email) {
            console.error('OAuth user has no email')
            return false
          }

          // Check if account already exists for this provider
          const existingAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            include: { user: true },
          })

          if (existingAccount) {
            // Account exists, allow sign in
            return true
          }

          // Check if user exists by email
          let userProfile = await prisma.userProfile.findUnique({
            where: { email },
          })

          if (!userProfile) {
            // Check if user exists by name (for migration from password users)
            userProfile = await prisma.userProfile.findFirst({
              where: { name },
            })

            if (userProfile && !userProfile.email) {
              // Link email to existing user
              userProfile = await prisma.userProfile.update({
                where: { id: userProfile.id },
                data: { email },
              })
            } else if (!userProfile) {
              // Create new user
              userProfile = await prisma.userProfile.create({
                data: { name, email },
              })
            } else {
              // Name exists but with different email - create new user with email
              userProfile = await prisma.userProfile.create({
                data: { name, email },
              })
            }
          }

          // Create the account link
          await prisma.account.create({
            data: {
              userId: userProfile.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token,
              access_token: account.access_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
            },
          })

          return true
        } catch (error) {
          console.error('OAuth sign in error:', error)
          return false
        }
      }

      return true
    },

    async jwt({ token, user, account }) {
      // On initial sign in, add user info to token
      if (user) {
        token.name = user.name
        token.email = user.email
        token.provider = account?.provider || 'credentials'
      }
      return token
    },

    async session({ session, token }) {
      // Add custom fields to session
      if (token) {
        session.user.provider = token.provider as string
      }
      return session
    },
  },
}
