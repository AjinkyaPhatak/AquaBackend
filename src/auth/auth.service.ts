import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { FirebaseService } from "../firebase/firebase.service";

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private firebaseService: FirebaseService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (
      user &&
      (await this.usersService.validatePassword(password, user.password))
    ) {
      const { password: _, ...result } = user.toObject();
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const payload = { email: user.email, sub: user._id, name: user.name };

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        totalAnalyses: user.totalAnalyses,
      },
      access_token: this.jwtService.sign(payload),
    };
  }

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);
    const { password: _, ...result } = user.toObject();

    const payload = { email: result.email, sub: result._id, name: result.name };

    return {
      user: {
        id: result._id,
        name: result.name,
        email: result.email,
        avatar: result.avatar || "",
        role: result.role,
        totalAnalyses: result.totalAnalyses,
      },
      access_token: this.jwtService.sign(payload),
    };
  }

  async googleLogin(idToken: string) {
    // verify the token with firebase
    const decoded = await this.firebaseService.verifyIdToken(idToken);
    if (!decoded || !decoded.email) {
      throw new UnauthorizedException("Invalid Firebase token");
    }

    // ensure email is verified (optional but good practice)
    if (!decoded.email_verified) {
      throw new UnauthorizedException("Email not verified by provider");
    }

    // lookup or create the user locally
    let user = await this.usersService.findByEmail(decoded.email);
    if (!user) {
      // create a random password so the schema requirement is satisfied
      const randomPassword = Math.random().toString(36).slice(-8);
      user = await this.usersService.create({
        name: decoded.name || decoded.email.split("@")[0],
        email: decoded.email,
        password: randomPassword,
        avatar: decoded.picture || "",
      });
    }

    const payload = { email: user.email, sub: user._id, name: user.name };
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        totalAnalyses: user.totalAnalyses,
      },
      access_token: this.jwtService.sign(payload),
    };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    const { password: _, ...result } = user.toObject();
    return result;
  }
}
