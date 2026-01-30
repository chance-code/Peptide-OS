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

            // Set this user as active in the database
            try {
              // First, deactivate all users
              await prisma.userProfile.updateMany({
                data: { isActive: false }
              })

              // Then activate the matching user
              await prisma.userProfile.updateMany({
                where: { name: userConfig.name },
                data: { isActive: true }
              })

              console.log(`Set ${userConfig.name} as active user`)
            } catch (error) {
              console.error('Error updating active user:', error)
            }

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
