import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as admin from "firebase-admin";

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App;

  constructor(private config: ConfigService) {
    // initialize only once
    if (!admin.apps.length) {
      const projectId = this.config.get<string>("FIREBASE_PROJECT_ID");
      const clientEmail = this.config.get<string>("FIREBASE_CLIENT_EMAIL");
      let privateKey = this.config.get<string>("FIREBASE_PRIVATE_KEY");

      if (privateKey) {
        // private keys stored in env often contain literal "\n" sequences
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      this.logger.log("Firebase admin initialized");
    } else {
      this.app = admin.app();
    }
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return this.app.auth().verifyIdToken(idToken);
  }
}
