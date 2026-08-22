export class Domain {
  public id: string = '';
  public createdAt: Date = new Date();
  public updatedAt: Date = new Date();

  constructor(data: any) {
    this.id = data.id;
    this.createdAt = new Date(data.createdAt);
    this.updatedAt = new Date(data.updatedAt);
  }
  toJson() {
    return JSON.parse(JSON.stringify(this));
  }
}
