import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FirebaseService } from "./firebase.service";

// make it global so any module can inject it without re-importing
@Global()
@Module({
  imports: [ConfigModule],
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}
