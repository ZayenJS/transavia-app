import nodemailer from 'nodemailer';

export class Mailer {
  private _transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: 465,
    secure: true,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  public constructor(private sender: string, private receivers: string[]) {}

  public async sendMail(subject: string, text: string, html: string) {
    return this._transporter.sendMail({
      from: this.sender, // sender address
      to: this.receivers.join(', '), // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });
  }
}
