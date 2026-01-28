import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

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

        const passwordHash = process.env.AUTH_PASSWORD_HASH
        console.log('Hash from env:', passwordHash ? `${passwordHash.substring(0, 20)}...` : 'NOT SET')

        if (!passwordHash) {
          console.error('AUTH_PASSWORD_HASH not configured')
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, passwordHash)
        console.log('Password valid:', isValid)

        if (isValid) {
          // Return a simple user object
          return {
            id: '1',
            name: 'User',
          }
        }

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
