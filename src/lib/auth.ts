import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
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
    async jwt({ token }) {
      return token
    },
    async session({ session }) {
      return session
    },
  },
}
